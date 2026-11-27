// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ident system through the composed step (INPUT-01, D-04): R engages it and
 * locks the nearest ship in the sights of the current view, U drops the lock, a
 * lock is lost beyond scanner range or when its ship is gone, and the target id
 * never leaves the world it names.
 *
 * Expected values are derived by hand from Oolite's rules: the search radius is
 * `SCANNER_MAX_RANGE - 100` = 25,500 m measured from the view origin
 * (`Universe.m:5653`), a ship is in the sights when the view axis passes
 * through its collision sphere (`:5694-5704`), and a lock is lost beyond the
 * scanner range of 25,600 m from the player (`PlayerEntity.m:3600-3603`).
 */

import { describe, expect, it } from "vitest";

import { STATION_KINDS } from "../../../src/content/stations.js";

import {
  COBRA_VIEW_OFFSETS,
  COBRA_WEAPON_OFFSETS,
  IDENT_ACQUIRE_RANGE,
  SCANNER_MAX_RANGE,
  toWegoliteLocal,
} from "../../../src/sim/combat/constants.js";
import {
  identTargetSnapshot,
  stepIdent,
} from "../../../src/sim/combat/ident.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import {
  resolveShots,
  stepPlayerCombat,
} from "../../../src/sim/combat/step.js";
import type { Command } from "../../../src/sim/commands.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import {
  add,
  identity,
  quatFromUnitVectors,
  rotate,
  sub,
  vec,
} from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import {
  MAIN_STATION_ID,
  NAV_BUOY_SUBENTITY_ID,
  NO_ENTITY,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
  WITCHPOINT_BUOY_SUBENTITY_ID,
} from "../../../src/sim/world/ids.js";
import { buoyPosition } from "../../../src/sim/world/statics.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { fullHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { stationSpecOf } from "../../helpers/stations.js";

const { layout, config, system: laveSystem } = laveFixture();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

const OPTIONS: StepOptions = { combat: { mounts: DEFAULT_LASER_MOUNTS } };

const IDENT: Command = { kind: "ident" };
const UNTARGET: Command = { kind: "untarget" };

/** A player launched, skipped to flight, parked at `FAR` and facing -Z. */
function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = 0;
  return state;
}

function spawnShip(
  world: World,
  specKey: string,
  position: Vec3,
  extra: Partial<SpawnInit> = {},
): number {
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey,
      scanClass: "CLASS_NEUTRAL",
      position,
      orientation: identity(),
      radius: 30,
      ...extra,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

/** A point `ahead` metres along -Z from the player, `side` metres to the right. */
function ahead(distance: number, side = 0): Vec3 {
  return vec(FAR.x + side, FAR.y, FAR.z - distance);
}

function step(
  player: FlightState,
  world: World | undefined,
  combat: PlayerCombatState,
  commands: readonly Command[] = [],
): SimEvent[] {
  return stepSim(
    player,
    world,
    layout,
    config,
    ZERO_INTENT,
    commands,
    DT,
    OPTIONS,
    combat,
  );
}

function ofKind<K extends SimEvent["kind"]>(
  events: readonly SimEvent[],
  kind: K,
): Extract<SimEvent, { kind: K }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: K }> => event.kind === kind,
  );
}

function kinds(events: readonly SimEvent[]): string[] {
  return events
    .map((event) => event.kind)
    .filter((kind) => kind.startsWith("ident"));
}

describe("R locks the ship in the sights (tracer)", () => {
  it("engages ident and locks an Adder 5,000 m ahead on the same tick", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(5000));

    const events = step(player, world, combat, [IDENT]);

    expect(kinds(events)).toEqual(["identEngaged", "identLocked"]);
    expect(ofKind(events, "identLocked")).toEqual([
      { kind: "identLocked", specKey: "adder" },
    ]);
    expect(combat.identEngaged).toBe(true);
    expect(combat.identTarget).toBe(id);
  });

  it("engages with nothing in the sights and locks a ship that arrives later", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);

    const first = step(player, world, combat, [IDENT]);
    expect(kinds(first)).toEqual(["identEngaged"]);
    expect(combat.identTarget).toBe(NO_ENTITY);

    const id = spawnShip(world, "viper", ahead(3000));
    const second = step(player, world, combat);
    expect(ofKind(second, "identLocked")).toEqual([
      { kind: "identLocked", specKey: "viper" },
    ]);
    expect(combat.identTarget).toBe(id);
  });

  it("does nothing for an R press while docked", () => {
    const player = initFlightState(layout);
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "adder", ahead(5000));
    const events = step(player, world, combat, [IDENT]);
    expect(kinds(events)).toEqual([]);
    expect(combat.identEngaged).toBe(false);
  });
});

describe("what the sights pick", () => {
  it("locks the nearer of two ships in the sights, whichever has the lower id", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "adder", ahead(9000));
    const near = spawnShip(world, "viper", ahead(4000));

    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(near);
  });

  it("keeps the lower id when two ships are at exactly the same distance", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const first = spawnShip(world, "adder", ahead(5000, 5));
    spawnShip(world, "viper", ahead(5000, -5));

    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(first);
  });

  it("ignores a ship behind the view, off the axis, out of range, a wreck or a CLASS_NO_DRAW ship", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "behind", vec(FAR.x, FAR.y, FAR.z + 4000));
    // 40 m off the axis against a 30 m collision radius.
    spawnShip(world, "offaxis", ahead(4000, 40));
    // Inside the scanner range but beyond the 25,500 m acquisition range.
    spawnShip(world, "toofar", ahead(25_560));
    // A wreck cannot collide (D-07, Universe.m:5691); a pod or plate can and
    // is locked (plan 18-06, below).
    spawnShip(world, "wreck", ahead(3000), { kind: "wreckage" });
    spawnShip(world, "hidden", ahead(2500), { scanClass: "CLASS_NO_DRAW" });

    const events = step(player, world, combat, [IDENT]);
    expect(kinds(events)).toEqual(["identEngaged"]);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });

  it("locks a ship just inside its collision radius of the axis", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(4000, 29));
    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(id);
  });

  it("measures the 25,500 m acquisition range from the view origin", () => {
    const origin = toWegoliteLocal(COBRA_VIEW_OFFSETS.fore);
    // Along the axis the ship's distance from the view origin is `d`; the
    // origin sits 31 m ahead of the player, so a ship at 25,520 m from the
    // player is 25,489 m from the origin and is inside the acquisition range.
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(IDENT_ACQUIRE_RANGE + 20));
    expect(origin.z).toBe(-31);
    expect(SCANNER_MAX_RANGE).toBe(25_600);
    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(id);
  });

  it("uses the view as the axis: aft view locks the ship behind, not the one ahead", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "adder", ahead(4000));
    const behind = spawnShip(world, "viper", vec(FAR.x, FAR.y, FAR.z + 6000));

    step(player, world, combat, [{ kind: "setView", view: "aft" }]);
    expect(combat.view).toBe("aft");
    const events = step(player, world, combat, [IDENT]);
    expect(ofKind(events, "identLocked")).toEqual([
      { kind: "identLocked", specKey: "viper" },
    ]);
    expect(combat.identTarget).toBe(behind);
  });

  it("uses the port view: a ship to the left is locked", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "adder", ahead(4000));
    const left = spawnShip(world, "viper", vec(FAR.x - 5000, FAR.y, FAR.z));

    step(player, world, combat, [{ kind: "setView", view: "port" }]);
    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(left);
  });
});

describe("R locks the station (tracer, CBT-17 criterion 3)", () => {
  it("locks the main station 3,000 m ahead and frames it at its layout radius", () => {
    const player = flyingPlayer();
    // 3,000 m from the main station's centre, nose (-Z) toward it.
    const station = layout.station.position;
    player.position = vec(station.x, station.y, station.z + 3000);
    const combat = createPlayerCombatState();
    const world = createWorld(7);

    // OPTIONS carries no hull table: ident needs none, as with traffic off.
    const events = step(player, world, combat, [IDENT]);

    expect(combat.identTarget).toBe(MAIN_STATION_ID);
    expect(kinds(events)).toEqual(["identEngaged", "identLocked"]);
    expect(ofKind(events, "identLocked")).toEqual([
      { kind: "identLocked", specKey: "coriolis-station" },
    ]);
    // The collision radius `firstEntityTargetedByPlayer` uses (layout.ts).
    expect(identTargetSnapshot(combat, world, layout)).toEqual({
      position: station,
      radius: 779.3702392578125,
    });
  });
});

describe("R while a lock exists", () => {
  it("D-04 (owner-confirmed): clears the lock and re-acquires the ship in the sights", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(5000));
    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(id);

    const events = step(player, world, combat, [IDENT]);

    // Oolite's handleButtonIdent: the lock is cleared and the next update
    // re-locks what is still in the sights. A literal D-04 would instead end in
    // identOff { wasEngaged: true } with no lock; this is the one case that
    // changes.
    expect(kinds(events)).toEqual(["identEngaged", "identLocked"]);
    expect(combat.identEngaged).toBe(true);
    expect(combat.identTarget).toBe(id);
  });

  it("D-04 (owner-confirmed): leaves no lock when nothing is in the sights any more", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(5000));
    step(player, world, combat, [IDENT]);
    const ship = world.store.get(id);
    if (ship === undefined) throw new Error("no ship");
    // Off the axis but well inside scanner range: the lock holds.
    ship.position = ahead(5000, 500);
    step(player, world, combat);
    expect(combat.identTarget).toBe(id);

    const events = step(player, world, combat, [IDENT]);
    expect(kinds(events)).toEqual(["identEngaged"]);
    expect(combat.identEngaged).toBe(true);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });
});

describe("U drops the lock", () => {
  it("clears the target and the engagement and reports wasEngaged", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "adder", ahead(5000));
    step(player, world, combat, [IDENT]);

    const events = step(player, world, combat, [UNTARGET]);

    expect(ofKind(events, "identOff")).toEqual([
      { kind: "identOff", wasEngaged: true },
    ]);
    expect(combat.identEngaged).toBe(false);
    expect(combat.identTarget).toBe(NO_ENTITY);
    // Ident is off, so the ship in the sights is not locked again.
    const after = step(player, world, combat);
    expect(kinds(after)).toEqual([]);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });

  it("reports wasEngaged false when ident was already off", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const events = step(player, world, combat, [UNTARGET]);
    expect(ofKind(events, "identOff")).toEqual([
      { kind: "identOff", wasEngaged: false },
    ]);
    expect(combat.identEngaged).toBe(false);
  });
});

describe("losing the lock", () => {
  it("drops a ship that moves beyond 25,600 m with identLost and stays engaged", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(5000));
    step(player, world, combat, [IDENT]);

    const ship = world.store.get(id);
    if (ship === undefined) throw new Error("no ship");
    // At exactly the scanner range Oolite still holds the lock.
    ship.position = ahead(SCANNER_MAX_RANGE);
    expect(kinds(step(player, world, combat))).toEqual([]);
    expect(combat.identTarget).toBe(id);

    ship.position = ahead(SCANNER_MAX_RANGE + 1);
    const events = step(player, world, combat);
    expect(kinds(events)).toEqual(["identLost"]);
    expect(combat.identEngaged).toBe(true);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });

  it("locks a new ship in the sights on the tick the old lock is lost", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const first = spawnShip(world, "adder", ahead(5000));
    step(player, world, combat, [IDENT]);
    const second = spawnShip(world, "viper", ahead(8000, 3));

    const ship = world.store.get(first);
    if (ship === undefined) throw new Error("no ship");
    ship.position = ahead(30_000);
    const events = step(player, world, combat);

    expect(kinds(events)).toEqual(["identLost", "identLocked"]);
    expect(combat.identTarget).toBe(second);
  });

  it("drops a ship that is gone from the world", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(5000));
    step(player, world, combat, [IDENT]);

    world.store.kill(id);
    world.store.commit();
    const events = step(player, world, combat);

    expect(kinds(events)).toEqual(["identLost"]);
    expect(combat.identEngaged).toBe(true);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });

  it("repairs a non-finite target id and never accepts a non-finite distance", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(5000));
    step(player, world, combat, [IDENT]);

    const ship = world.store.get(id);
    if (ship === undefined) throw new Error("no ship");
    ship.position = vec(Number.NaN, 0, 0);
    expect(kinds(step(player, world, combat))).toEqual(["identLost"]);
    expect(combat.identTarget).toBe(NO_ENTITY);

    combat.identTarget = Number.NaN;
    step(player, world, combat);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });
});

describe("the target never leaves the world it names", () => {
  const jumped: SimEvent = {
    kind: "hyperspaceJumped",
    destinationId: "g0-s1",
    clockDeltaSeconds: 0,
    fuelCost: 0,
  };

  it("clears the target silently on a jump commit and keeps ident engaged", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.identEngaged = true;
    combat.identTarget = 101;
    const events: SimEvent[] = [];

    stepIdent(combat, player, [], [jumped], true, events);

    expect(events).toEqual([]);
    expect(combat.identTarget).toBe(NO_ENTITY);
    expect(combat.identEngaged).toBe(true);
  });

  it("does not acquire on the jump tick, which skips the old world", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.identEngaged = true;
    const world = createWorld(7);
    spawnShip(world, "adder", ahead(5000));
    // Mirrors the jump step: the combat step sees the event and the world is
    // not stepped, so the resolution never reaches the old world's ids.
    const stepped = stepPlayerCombat(
      combat,
      player,
      ZERO_INTENT,
      [],
      [jumped],
      OPTIONS,
      DT,
    );
    const resolved = resolveShots(
      world,
      false,
      player,
      combat,
      stepped.shots,
      OPTIONS,
      DT,
      layout,
    );
    expect(stepped.events).toEqual([]);
    expect(resolved).toEqual([]);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });

  it("clears the target and ident on docking", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    combat.identEngaged = true;
    combat.identTarget = 101;

    stepPlayerCombat(
      combat,
      player,
      ZERO_INTENT,
      [IDENT],
      [{ kind: "docked", via: "manual", clockDelta: 0 }],
      OPTIONS,
      DT,
    );

    expect(combat.identEngaged).toBe(false);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });

  it("ignores the ident commands on the tick that completes the launch", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const events: SimEvent[] = [];
    stepIdent(combat, player, [IDENT, UNTARGET], [], false, events);
    expect(events).toEqual([]);
    expect(combat.identEngaged).toBe(false);
  });

  it("a fresh combat state holds no target", () => {
    const combat = createPlayerCombatState();
    expect(combat.identEngaged).toBe(false);
    expect(combat.identTarget).toBe(NO_ENTITY);
  });
});

describe("identTargetSnapshot", () => {
  it("returns the locked ship's position and collision radius", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "adder", ahead(5000), { radius: 41 });
    step(player, world, combat, [IDENT]);

    expect(identTargetSnapshot(combat, world, layout)).toEqual({
      position: ahead(5000),
      radius: 41,
    });
  });

  it("is undefined with no lock, no world or a ship that is gone", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const id = spawnShip(world, "adder", ahead(5000));
    expect(identTargetSnapshot(combat, world, layout)).toBeUndefined();

    step(player, world, combat, [IDENT]);
    expect(identTargetSnapshot(combat, undefined, layout)).toBeUndefined();
    world.store.kill(id);
    expect(identTargetSnapshot(combat, world, layout)).toBeUndefined();
  });
});

/*
 * The statics, pods and plates as ident targets (CBT-17, plan 18-06, D-05,
 * D-07, PD-02), from Oolite's `firstEntityTargetedByPlayer`
 * (`Universe.m:5649-5722`: every entity that `isShip` and `canCollide`, its
 * `collisionRadius` the sphere) and `isValidTarget` (`PlayerEntity.m:3595-3628`:
 * lost beyond `SCANNER_MAX_RANGE2`). A buoy's subentity is no entity of its own
 * in Oolite's list, and a wreck cannot collide.
 */

/** A flying player `distance` metres along +Z from `target`, nose (-Z) at it. */
function facing(target: Vec3, distance = 3000): FlightState {
  const player = flyingPlayer();
  player.position = vec(target.x, target.y, target.z + distance);
  return player;
}

describe("both buoys, pods and plates lock; wrecks never (D-07)", () => {
  it("locks the nav buoy as buoy and the witchpoint buoy as buoy-witchpoint, at their layout radius", () => {
    for (const [key, id, specKey] of [
      ["navBuoy", STATION_NAV_BUOY_ID, "buoy"],
      ["witchpoint", WITCHPOINT_BUOY_ID, "buoy-witchpoint"],
    ] as const) {
      const world = createWorld(7);
      const player = facing(buoyPosition(world, layout, key));
      const combat = createPlayerCombatState();

      const events = step(player, world, combat, [IDENT]);

      expect(combat.identTarget).toBe(id);
      expect(ofKind(events, "identLocked")).toEqual([
        { kind: "identLocked", specKey },
      ]);
      expect(identTargetSnapshot(combat, world, layout)).toEqual({
        position: layout[key].position,
        radius: 59.13554763793945,
      });
    }
  });

  it("PD-02: locks a nav buoy moved by (200, 0, 0) only where it now is", () => {
    const world = createWorld(7);
    world.buoys.navBuoy.offset = vec(200, 0, 0);
    const moved = buoyPosition(world, layout, "navBuoy");
    expect(moved).toEqual(add(layout.navBuoy.position, vec(200, 0, 0)));

    // Aimed at the layout position, 200 m beside the buoy's 59 m sphere.
    const stale = facing(layout.navBuoy.position);
    const staleCombat = createPlayerCombatState();
    step(stale, world, staleCombat, [IDENT]);
    expect(staleCombat.identTarget).not.toBe(STATION_NAV_BUOY_ID);

    const player = facing(moved);
    const combat = createPlayerCombatState();
    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(STATION_NAV_BUOY_ID);
    expect(identTargetSnapshot(combat, world, layout)?.position).toEqual(moved);
  });

  it("locks a cargo pod (barrel) and an alloy plate by their spec keys", () => {
    // On the fore view axis: the view origin sits off the ship's centre line,
    // and a 5 m piece is smaller than that offset.
    const onAxis = add(ahead(3000), toWegoliteLocal(COBRA_VIEW_OFFSETS.fore));
    for (const specKey of ["barrel", "alloy"]) {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const world = createWorld(7);
      const id = spawnShip(world, specKey, onAxis, {
        kind: "cargo",
        scanClass: "CLASS_CARGO",
        radius: 5,
      });

      const events = step(player, world, combat, [IDENT]);

      expect(combat.identTarget).toBe(id);
      expect(ofKind(events, "identLocked")).toEqual([
        { kind: "identLocked", specKey },
      ]);
      expect(identTargetSnapshot(combat, world, layout)).toEqual({
        position: onAxis,
        radius: 5,
      });
    }
  });

  it("never locks a wreck in the sights and locks the ship behind it", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "wreck", ahead(3000), { kind: "wreckage" });
    const behind = spawnShip(world, "adder", ahead(5000));

    const events = step(player, world, combat, [IDENT]);

    expect(combat.identTarget).toBe(behind);
    expect(ofKind(events, "identLocked")).toEqual([
      { kind: "identLocked", specKey: "adder" },
    ]);
  });

  it("keeps the static on an equal distance: the station row is visited first", () => {
    const world = createWorld(7);
    const at = layout.navBuoy.position;
    // A ship at the buoy's own centre is at exactly the buoy's distance.
    spawnShip(world, "adder", at);
    const player = facing(at);
    const combat = createPlayerCombatState();

    step(player, world, combat, [IDENT]);

    expect(combat.identTarget).toBe(STATION_NAV_BUOY_ID);
  });
});

describe("a static lock is lost as a ship's is (D-05)", () => {
  /** The beam line of step.test's buoy tests: +X, 9 m up and 14 m aside. */
  const PLUS_X = quatFromUnitVectors(vec(0, 0, -1), vec(1, 0, 0));
  const HULL_LINE = vec(-2000, 9, 14);
  const FIRE: ControlIntent = { ...ZERO_INTENT, fire: true };
  const FULL: StepOptions = {
    combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: fullHullTable() },
  };

  /** A player whose fore pulse starts exactly at `origin`, facing `orientation`. */
  function playerAt(origin: Vec3, orientation: Quat): FlightState {
    const state = flyingPlayer();
    state.flightTime = 0;
    state.orientation = orientation;
    state.position = sub(
      origin,
      rotate(orientation, toWegoliteLocal(COBRA_WEAPON_OFFSETS.fore)),
    );
    return state;
  }

  it("a locked nav buoy destroyed by a real shot emits identLost after shipDestroyed on that tick", () => {
    const world = createWorld(7);
    const player = playerAt(add(layout.navBuoy.position, HULL_LINE), PLUS_X);
    const combat = createPlayerCombatState();
    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(STATION_NAV_BUOY_ID);

    // One pulse (15) is lethal once the buoy is down to 1.
    world.staticHealth.navBuoy = 1;
    const events = stepSim(
      player,
      world,
      layout,
      config,
      FIRE,
      [],
      DT,
      FULL,
      combat,
    );

    const destroyed = events.findIndex(
      (event) =>
        event.kind === "shipDestroyed" && event.id === STATION_NAV_BUOY_ID,
    );
    const lost = events.findIndex((event) => event.kind === "identLost");
    expect(destroyed).toBeGreaterThan(-1);
    expect(lost).toBeGreaterThan(destroyed);
    expect(combat.identTarget).not.toBe(STATION_NAV_BUOY_ID);
    expect(combat.identEngaged).toBe(true);
    expect(identTargetSnapshot(combat, world, layout)?.position).not.toEqual(
      layout.navBuoy.position,
    );
  });

  it("never acquires a destroyed buoy", () => {
    const world = createWorld(7);
    world.staticHealth.navBuoy = 0;
    const player = facing(layout.navBuoy.position);
    const combat = createPlayerCombatState();

    const events = step(player, world, combat, [IDENT]);

    expect(combat.identTarget).not.toBe(STATION_NAV_BUOY_ID);
    expect(
      ofKind(events, "identLocked").filter((e) => e.specKey === "buoy"),
    ).toEqual([]);
  });

  it("holds a static at exactly 25,600 m and loses it 1 m further", () => {
    const world = createWorld(7);
    const at = layout.witchpoint.position;
    expect(at).toEqual(vec(0, 0, 0));
    const player = facing(at);
    const combat = createPlayerCombatState();
    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(WITCHPOINT_BUOY_ID);

    player.position = vec(0, 0, SCANNER_MAX_RANGE);
    expect(kinds(step(player, world, combat))).toEqual([]);
    expect(combat.identTarget).toBe(WITCHPOINT_BUOY_ID);

    player.position = vec(0, 0, SCANNER_MAX_RANGE + 1);
    expect(kinds(step(player, world, combat))).toEqual(["identLost"]);
    expect(combat.identTarget).toBe(NO_ENTITY);
    expect(combat.identEngaged).toBe(true);
  });

  it("never holds a buoy subentity: ids 6 and 7 are no target", () => {
    for (const id of [WITCHPOINT_BUOY_SUBENTITY_ID, NAV_BUOY_SUBENTITY_ID]) {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      combat.identEngaged = true;
      combat.identTarget = id;
      const world = createWorld(7);

      expect(identTargetSnapshot(combat, world, layout)).toBeUndefined();
      expect(kinds(step(player, world, combat))).toEqual(["identLost"]);
      expect(combat.identTarget).toBe(NO_ENTITY);
    }
  });

  it("frames nothing without a layout", () => {
    const world = createWorld(7);
    const player = facing(layout.station.position);
    const combat = createPlayerCombatState();
    step(player, world, combat, [IDENT]);
    expect(combat.identTarget).toBe(MAIN_STATION_ID);
    expect(identTargetSnapshot(combat, world, undefined)).toBeUndefined();
  });
});

describe("R locks the system's own main station (Phase 22.1, WORLD-20, D-B)", () => {
  it.each(STATION_KINDS)(
    "emits identLocked with the %s station's key and frames it at its own radius",
    (kind) => {
      // A copy of Lave whose station is this kind (the kind does not move the
      // station), so the spec and the system agree.
      const spec = stationSpecOf(kind);
      const own = deriveSystemLayout({ ...laveSystem, station: kind }, spec);
      const player = flyingPlayer();
      const station = own.station.position;
      player.position = vec(station.x, station.y, station.z + 3000);
      const combat = createPlayerCombatState();
      const world = createWorld(7);

      const events = stepSim(
        player,
        world,
        own,
        config,
        ZERO_INTENT,
        [IDENT],
        DT,
        OPTIONS,
        combat,
      );

      expect(combat.identTarget).toBe(MAIN_STATION_ID);
      expect(ofKind(events, "identLocked")).toEqual([
        { kind: "identLocked", specKey: `${kind}-station` },
      ]);
      expect(identTargetSnapshot(combat, world, own)).toEqual({
        position: station,
        radius: spec.collisionRadius,
      });
    },
  );
});
