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

import {
  COBRA_VIEW_OFFSETS,
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
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { MAIN_STATION_ID, NO_ENTITY } from "../../../src/sim/world/ids.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();

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

  it("ignores a ship behind the view, off the axis, out of range or not a ship", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    spawnShip(world, "behind", vec(FAR.x, FAR.y, FAR.z + 4000));
    // 40 m off the axis against a 30 m collision radius.
    spawnShip(world, "offaxis", ahead(4000, 40));
    // Inside the scanner range but beyond the 25,500 m acquisition range.
    spawnShip(world, "toofar", ahead(25_560));
    spawnShip(world, "crate", ahead(3000), { kind: "cargo" });
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
