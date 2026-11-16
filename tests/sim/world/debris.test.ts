// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The cargo pods a destroyed ship releases (WORLD-17, CBT-08 destruction
 * clauses, staged; plan 16-02).
 *
 * The oracle is written here from the C lines, never by calling the release's
 * internals: `releaseCargoPodsDebris` (`ShipEntity.m:7814-7879`) with the
 * port conventions `Ranrot() % N` = `floor(u * N)` and `randf()` = `u`, over a
 * copy of the victim's own `combat` stream, after the `canFragment` draw
 * (D16-12, D16-13). No commodity, amount, role or temperature draw is taken
 * (D16-01, D16-24).
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { identity, normalize, quat, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import type { RngState } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { npcContacts } from "../../../src/sim/world/contacts.js";
import type { DebrisContext } from "../../../src/sim/world/debris.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { killShip } from "../../../src/sim/world/kill.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createShipField } from "../../../src/sim/world/ship-field.js";
import {
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { debrisFixture, FIXTURE_POD } from "../../helpers/debris-fixture.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();
const CONTENT = debrisFixture();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);
const FIRE: ControlIntent = { ...ZERO_INTENT, fire: true };

// ---------------------------------------------------------------------------
// The oracle, from the C (ShipEntity.m:7814-7879, OOVector.m:107-113,
// OOQuaternion.m:41-48).

interface OraclePod {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly orientation: Quat;
}

interface OracleResult {
  readonly pods: OraclePod[];
  readonly draws: number;
  readonly finalState: number;
}

interface OracleVictim {
  readonly stream: number;
  readonly cargo: number;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly box: { readonly min: Vec3; readonly max: Vec3 };
}

function oracle(victim: OracleVictim): OracleResult {
  const rng: RngState = createRngState(victim.stream);
  let draws = 0;
  const u = (): number => {
    draws += 1;
    return rngNext(rng);
  };
  // canFragment (D16-13): drawn, unused for pods.
  u();
  const pods: OraclePod[] = [];
  let cargoChance = 70;
  let limit = 15;
  for (let i = 0; i < victim.cargo; i += 1) {
    if (Math.floor(u() * 100) < cargoChance) {
      if (cargoChance > 10) cargoChance -= 30; // NPC branch
      limit -= 1;
      const { min, max } = victim.box;
      const rx = min.x + u() * (max.x - min.x);
      const ry = min.y + u() * (max.y - min.y);
      const rz = min.z + u() * (max.z - min.z);
      const jx = Math.floor(u() * 7) - 3;
      const jy = Math.floor(u() * 7) - 3;
      const jz = Math.floor(u() * 7) - 3;
      const vx = 0.1 * (Math.floor(u() * 200) - 100);
      const vy = 0.1 * (Math.floor(u() * 200) - 100);
      const vz = 0.1 * (Math.floor(u() * 200) - 100);
      const qw = Math.floor(u() * 1024) - 511.5;
      const qx = Math.floor(u() * 1024) - 511.5;
      const qy = Math.floor(u() * 1024) - 511.5;
      const qz = Math.floor(u() * 1024) - 511.5;
      // Oolite model axes to Wegolite local: (x, y, -z), added unrotated.
      const lz = rz === 0 ? 0 : -rz;
      pods.push({
        position: vec(
          victim.position.x + rx + jx,
          victim.position.y + ry + jy,
          victim.position.z + lz + jz,
        ),
        velocity: vec(
          vx + victim.velocity.x,
          vy + victim.velocity.y,
          vz + victim.velocity.z,
        ),
        orientation: normalize(quat(qw, qx, qy, qz)),
      });
    }
    if (limit <= 0) break;
  }
  return { pods, draws, finalState: rng.s };
}

/** The pod survival chance after each successive survivor (C schedule). */
function chanceSchedule(survivors: number): number[] {
  const out: number[] = [];
  let chance = 70;
  for (let i = 0; i < survivors; i += 1) {
    if (chance > 10) chance -= 30;
    out.push(chance);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures.

function boxOf(specKey: string): { min: Vec3; max: Vec3 } {
  const hull = CONTENT.hulls.get(specKey);
  if (hull === undefined) throw new Error(`no hull ${specKey}`);
  return hull.boundingBox;
}

function spawnShip(
  world: World,
  options: {
    readonly cargo?: number;
    readonly position?: Vec3;
    readonly orientation?: Quat;
    readonly speed?: number;
    readonly velocity?: Vec3;
    readonly maxEnergy?: number;
    readonly kind?: "ship" | "cargo";
  } = {},
): Entity {
  const result = spawnEntity(
    world,
    {
      kind: options.kind ?? "ship",
      specKey: "adder",
      scanClass: "CLASS_NEUTRAL",
      position: options.position ?? vec(100, 200, 300),
      orientation: options.orientation ?? identity(),
      radius: 30,
      maxEnergy: options.maxEnergy ?? 85,
      ...(options.cargo === undefined ? {} : { cargo: options.cargo }),
      ...(options.speed === undefined ? {} : { speed: options.speed }),
      ...(options.velocity === undefined ? {} : { velocity: options.velocity }),
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity;
}

function context(tick = 5): DebrisContext {
  return { tick, content: CONTENT };
}

function podsOf(world: World): Entity[] {
  return world.store.live.filter((e) => !e.dead && e.kind === "cargo");
}

function expectPodsEqual(world: World, expected: readonly OraclePod[]): void {
  const pods = podsOf(world);
  expect(pods).toHaveLength(expected.length);
  pods.forEach((pod, i) => {
    const want = expected[i];
    if (want === undefined) throw new Error("missing oracle pod");
    expect(pod.position).toEqual(want.position);
    expect(pod.velocity).toEqual(want.velocity);
    expect(pod.orientation).toEqual(want.orientation);
  });
}

/** Kill `victim` with a context and return the oracle it must equal. */
function killAndOracle(
  world: World,
  victim: Entity,
): { oracle: OracleResult; events: SimEvent[] } {
  const expected = oracle({
    stream: victim.rng.combat,
    cargo: victim.cargo,
    position: victim.position,
    velocity: victim.velocity,
    box: boxOf(victim.specKey),
  });
  const events: SimEvent[] = [];
  expect(killShip(world, victim.id, PLAYER_KILLER, events, context())).toBe(
    true,
  );
  return { oracle: expected, events };
}

const PLAYER_KILLER = PLAYER_ID;

// Pinned from the tracer run (world seed 7, cargo 10).
const PINNED_POD_COUNT = 4;
const PINNED_FIRST_POSITION: Vec3 = vec(
  9999989.988414517,
  -12.830020767197482,
  -2006.82235684927,
);
const PINNED_FIRST_VELOCITY: Vec3 = vec(-3.1, 9, -8.6);
const PINNED_FIRST_ORIENTATION: Quat = quat(
  0.5907595014547972,
  0.3389898509108958,
  0.5440022806395012,
  -0.49005164123723666,
);

// ---------------------------------------------------------------------------
// The composed step.

function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = 0;
  return state;
}

function debrisOptions(): StepOptions {
  return {
    combat: {
      mounts: DEFAULT_LASER_MOUNTS,
      hulls: HULLS,
      debris: CONTENT,
    },
  };
}

function stepOnce(
  player: FlightState,
  world: World,
  combat: PlayerCombatState,
  intent: ControlIntent,
  options: StepOptions,
): SimEvent[] {
  return stepSim(
    player,
    world,
    layout,
    config,
    intent,
    [],
    DT,
    options,
    combat,
  );
}

describe("a ship with cargo destroyed by the player's laser (tracer)", () => {
  it("releases the oracle's pods on the kill tick, which drift, hash and snapshot", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    const victim = spawnShip(world, {
      cargo: 10,
      position: vec(FAR.x, FAR.y, FAR.z - 2000),
      maxEnergy: 10,
    });
    // No AI: stepWorld does not draw the victim's stream before the kill.
    const expected = oracle({
      stream: victim.rng.combat,
      cargo: 10,
      position: victim.position,
      velocity: victim.velocity,
      box: boxOf("adder"),
    });

    const events = stepOnce(player, world, combat, FIRE, debrisOptions());

    expect(events.filter((e) => e.kind === "shipDestroyed")).toHaveLength(1);
    expect(world.store.get(victim.id)).toBeUndefined();
    const pods = podsOf(world);
    // Pinned after measuring (world seed 7).
    expect(pods).toHaveLength(PINNED_POD_COUNT);
    expectPodsEqual(world, expected.pods);
    for (const pod of pods) {
      expect(pod.specKey).toBe("barrel");
      expect(pod.kind).toBe("cargo");
      expect(pod.scanClass).toBe("CLASS_CARGO");
      expect(pod.radius).toBe(FIXTURE_POD.radius);
      expect(pod.energy).toBe(1);
      expect(pod.maxEnergy).toBe(1);
      expect(pod.ai).toBeNull();
      expect(pod.speed).toBe(0);
      expect(pod.spawnTick).toBe(player.tick);
    }
    const first = pods[0];
    if (first === undefined) throw new Error("no pod");
    expect(first.position).toEqual(PINNED_FIRST_POSITION);
    expect(first.velocity).toEqual(PINNED_FIRST_VELOCITY);
    expect(first.orientation).toEqual(PINNED_FIRST_ORIENTATION);

    // The snapshot at the boundary round-trips with an equal hash.
    const restored = restoreWorld(
      parseWorldSnapshot(JSON.parse(JSON.stringify(snapshotWorld(world)))),
    );
    expect(hashWorld(player, restored, combat)).toBe(
      hashWorld(player, world, combat),
    );

    // One more tick moves each pod by exactly velocity * DT.
    const before = pods.map((pod) => ({
      position: { ...pod.position },
      velocity: { ...pod.velocity },
    }));
    stepOnce(player, world, combat, ZERO_INTENT, debrisOptions());
    podsOf(world).forEach((pod, i) => {
      const was = before[i];
      if (was === undefined) throw new Error("missing pod");
      expect(pod.position).toEqual({
        x: was.position.x + was.velocity.x * DT,
        y: was.position.y + was.velocity.y * DT,
        z: was.position.z + was.velocity.z * DT,
      });
      expect(pod.velocity).toEqual(was.velocity);
    });
  });
});

describe("the pod rule (ShipEntity.m:7814-7879)", () => {
  for (const cargo of [1, 3, 20, 200]) {
    for (const seed of [1, 7, 42, 9001, 0xdead_beef]) {
      it(`equals the oracle for cargo ${String(cargo)}, world seed ${String(seed)}`, () => {
        const world = createWorld(seed);
        const victim = spawnShip(world, { cargo });
        const { oracle: expected } = killAndOracle(world, victim);
        expectPodsEqual(world, expected.pods);
        expect(victim.rng.combat).toBe(expected.finalState);
        expect(expected.pods.length).toBeLessThanOrEqual(15);
      });
    }
  }

  it("follows the chance schedule 70, 40, 10, 10 and never exceeds 15 pods", () => {
    expect(chanceSchedule(5)).toEqual([40, 10, 10, 10, 10]);
    let maxPods = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const world = createWorld(seed);
      const victim = spawnShip(world, { cargo: 200 });
      killAndOracle(world, victim);
      maxPods = Math.max(maxPods, podsOf(world).length);
      expect(podsOf(world).length).toBeLessThanOrEqual(15);
    }
    expect(maxPods).toBeGreaterThan(1);
  });

  it("advances the victim stream by exactly 1 + capsules examined + 13 x survivors", () => {
    for (const cargo of [0, 1, 3, 20, 200]) {
      const world = createWorld(11);
      const victim = spawnShip(world, { cargo });
      const start = victim.rng.combat;
      killAndOracle(world, victim);
      const survivors = podsOf(world).length;
      // Count the capsules the C examines: stop after the 15th survivor.
      const probe = createRngState(start);
      rngNext(probe);
      let chance = 70;
      let limit = 15;
      let examined = 0;
      for (let i = 0; i < cargo; i += 1) {
        examined += 1;
        if (Math.floor(rngNext(probe) * 100) < chance) {
          if (chance > 10) chance -= 30;
          limit -= 1;
          for (let k = 0; k < 13; k += 1) rngNext(probe);
        }
        if (limit <= 0) break;
      }
      const replay = createRngState(start);
      for (let k = 0; k < 1 + examined + 13 * survivors; k += 1) {
        rngNext(replay);
      }
      expect(victim.rng.combat).toBe(replay.s);
    }
  });

  it("adds the box offset unrotated: two orientations give the same offsets", () => {
    const offsets = (orientation: Quat): Vec3[] => {
      const world = createWorld(21);
      const victim = spawnShip(world, { cargo: 20, orientation });
      killAndOracle(world, victim);
      return podsOf(world).map((pod) =>
        vec(
          pod.position.x - victim.position.x,
          pod.position.y - victim.position.y,
          pod.position.z - victim.position.z,
        ),
      );
    };
    const a = offsets(identity());
    const b = offsets(normalize(quat(0.5, 0.5, -0.5, 0.5)));
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  });

  it("adds the victim's drift velocity, never its flight speed", () => {
    const world = createWorld(33);
    const victim = spawnShip(world, {
      cargo: 20,
      speed: 300,
      velocity: vec(1, 2, 3),
    });
    const start = victim.rng.combat;
    const { oracle: expected } = killAndOracle(world, victim);
    expect(expected.pods.length).toBeGreaterThan(0);
    expectPodsEqual(world, expected.pods);
    // Without the drift the same draws give velocities 1, 2, 3 lower.
    const still = oracle({
      stream: start,
      cargo: 20,
      position: victim.position,
      velocity: vec(0, 0, 0),
      box: boxOf("adder"),
    });
    podsOf(world).forEach((pod, i) => {
      const base = still.pods[i];
      if (base === undefined) throw new Error("missing oracle pod");
      expect(pod.velocity).toEqual(
        vec(base.velocity.x + 1, base.velocity.y + 2, base.velocity.z + 3),
      );
    });
  });

  it("releases nothing without a context or for a non-ship victim", () => {
    const world = createWorld(5);
    const ship = spawnShip(world, { cargo: 50 });
    const stream = ship.rng.combat;
    const events: SimEvent[] = [];
    expect(killShip(world, ship.id, PLAYER_KILLER, events)).toBe(true);
    expect(podsOf(world)).toHaveLength(0);
    expect(ship.rng.combat).toBe(stream);

    const other = createWorld(5);
    const crate = spawnShip(other, { cargo: 50, kind: "cargo" });
    const nextId = other.store.nextId;
    expect(killShip(other, crate.id, PLAYER_KILLER, [], context())).toBe(true);
    expect(other.store.nextId).toBe(nextId);
    expect(other.store.live.filter((e) => !e.dead)).toHaveLength(0);
  });
});

describe("debris is no target (D16-03, OC-3)", () => {
  it("is not hit by the laser, not a scanner contact and does not mass-lock", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(9);
    const pod = spawnEntity(
      world,
      {
        kind: "cargo",
        specKey: "barrel",
        scanClass: "CLASS_CARGO",
        position: vec(FAR.x, FAR.y, FAR.z - 1000),
        orientation: identity(),
        radius: 40,
        speed: 0,
        ai: null,
        maxEnergy: 1,
        energyRechargeRate: 0,
      },
      0,
    );
    if (!pod.ok) throw new Error("spawn refused");

    const events = stepOnce(player, world, combat, FIRE, debrisOptions());
    expect(events.some((e) => e.kind === "laserFired")).toBe(true);
    expect(events.some((e) => e.kind === "shipHit")).toBe(false);
    expect(pod.entity.energy).toBe(1);
    expect(pod.entity.dead).toBe(false);
    expect(npcContacts(world)).toHaveLength(0);
    expect(
      createShipField(world, undefined).massLocked(
        player.position,
        layout.scannerRange,
      ),
    ).toBe(false);
  });
});
