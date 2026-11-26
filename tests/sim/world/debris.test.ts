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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { playerLaserRay } from "../../../src/sim/combat/aim.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { resolveShots } from "../../../src/sim/combat/step.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import type { ControlIntent } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import type { HullOctree, OctreeNode } from "../../../src/sim/combat/octree.js";
import {
  identity,
  normalize,
  normalizeVec,
  quat,
  rotate,
  vec,
} from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";
import type { RngState } from "../../../src/sim/rng.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { npcContacts } from "../../../src/sim/world/contacts.js";
import {
  BLAST_MIN_DISTANCE_SQUARED,
  BLAST_MOMENTUM_FACTOR,
  BLAST_RANGE_FACTOR,
  debrisMassOf,
  MAX_WRECKS,
  N_ALLOYS_MASS_UNIT,
  OCTANT_DRAWS_PER_WRECK,
  wreckHeatDrain,
} from "../../../src/sim/world/debris.js";
import type {
  DebrisContent,
  DebrisContext,
  DebrisHull,
} from "../../../src/sim/world/debris.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { killShip } from "../../../src/sim/world/kill.js";
import { sanitizeEntity } from "../../../src/sim/world/sanitize.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import { createShipField } from "../../../src/sim/world/ship-field.js";
import {
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import {
  debrisFixture,
  FIXTURE_PLATE,
  FIXTURE_POD,
} from "../../helpers/debris-fixture.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import {
  BLAST_FIXTURE_FILE,
  BlastFileSchema,
  withinTolerance,
} from "../../oracles/combat/response/schema.js";
import type { BlastFixture } from "../../oracles/combat/response/schema.js";

const { layout, config } = laveFixture();
const HULLS = realHullTable();
const CONTENT = debrisFixture();

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);
const FIRE: ControlIntent = { ...ZERO_INTENT, fire: true };

// ---------------------------------------------------------------------------
// The oracle, from the C (ShipEntity.m:7814-7879 and 8042-8069, Universe.m:
// 5497-5526, Octree.m:683-714, OOVector.m:107-113, OOQuaternion.m:41-48).

/** A pod or a plate: placed and moving the same way (13 draws). */
interface OraclePod {
  readonly position: Vec3;
  /** The velocity after the blast. */
  velocity: Vec3;
  /** The velocity at release, before the blast. */
  readonly released: Vec3;
  readonly orientation: Quat;
}

interface OracleWreck {
  readonly specKey: string;
  readonly position: Vec3;
  /** The velocity after the blast. */
  velocity: Vec3;
  /** The velocity at release, before the blast. */
  readonly released: Vec3;
  readonly orientation: Quat;
  readonly radius: number;
  readonly energy: number;
}

interface OracleResult {
  readonly canFragment: boolean;
  readonly pods: OraclePod[];
  /** The wreck count drawn (or 0 when the wreck block does not run). */
  readonly wreckCount: number;
  readonly wrecks: OracleWreck[];
  readonly plates: OraclePod[];
  readonly draws: number;
  readonly finalState: number;
}

interface OracleVictim {
  readonly stream: number;
  readonly cargo: number;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly box: { readonly min: Vec3; readonly max: Vec3 };
  /** The hull key (mass and fragment chance from the content); "adder" by default. */
  readonly specKey?: string;
  readonly orientation?: Quat;
  /** The victim's octree, or none (the wreck starts at the centre). */
  readonly octree?: HullOctree;
  /** The victim's collision radius (the blast range); 30 by default. */
  readonly radius?: number;
}

/** One velocity component inside +-MAX_ENTITY_VELOCITY (1e4). */
function oracleClamp(v: number): number {
  return Math.min(1e4, Math.max(-1e4, v));
}

/** `Octree.m:158-161` `offsetForOctant`. */
function oracleOctantOffset(oct: number, r: number): Vec3 {
  return vec(
    (0.5 - ((oct >> 2) & 1)) * r,
    (0.5 - ((oct >> 1) & 1)) * r,
    (0.5 - (oct & 1)) * r,
  );
}

/**
 * `Octree.m:683-714` `randomFullNodeFrom`, recursive as in the C, with the
 * octant of level `level` taken from the pre-drawn list (D16-17).
 */
function oracleRandomFullNode(
  node: OctreeNode,
  radius: number,
  octants: readonly number[],
  level: number,
  offset: Vec3,
): Vec3 {
  if (node === 0 || node === -1) return offset;
  if (!Array.isArray(node) || node.length !== 8) return offset;
  const drawn = octants[level];
  if (drawn === undefined) return offset;
  const children: readonly OctreeNode[] = node;
  const oct = drawn & 7;
  for (let i = 0; i < 8; i += 1) {
    const octant = oct ^ i;
    const child = children[octant];
    if (child !== undefined && child !== 0) {
      const off = oracleOctantOffset(octant, radius);
      return oracleRandomFullNode(
        child,
        0.5 * radius,
        octants,
        level + 1,
        vec(offset.x + off.x, offset.y + off.y, offset.z + off.z),
      );
    }
  }
  return offset;
}

function oracle(victim: OracleVictim): OracleResult {
  const rng: RngState = createRngState(victim.stream);
  let draws = 0;
  const u = (): number => {
    draws += 1;
    return rngNext(rng);
  };
  const hull = CONTENT.hulls.get(victim.specKey ?? "adder");
  if (hull === undefined) throw new Error("no oracle hull");
  // canFragment (D16-13).
  const canFragment = u() < hull.fragmentChance;
  // OORandomPositionInBoundingBox, the jitter, the kick and
  // quaternion_set_random (ShipEntity.m:7847-7870, 8088-8101).
  const scatter = (): OraclePod => {
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
    const released = vec(
      vx + victim.velocity.x,
      vy + victim.velocity.y,
      vz + victim.velocity.z,
    );
    return {
      position: vec(
        victim.position.x + rx + jx,
        victim.position.y + ry + jy,
        victim.position.z + lz + jz,
      ),
      velocity: released,
      released,
      orientation: normalize(quat(qw, qx, qy, qz)),
    };
  };
  const pods: OraclePod[] = [];
  let cargoChance = 70;
  let limit = 15;
  for (let i = 0; i < victim.cargo; i += 1) {
    if (Math.floor(u() * 100) < cargoChance) {
      if (cargoChance > 10) cargoChance -= 30; // NPC branch
      limit -= 1;
      pods.push(scatter());
    }
    if (limit <= 0) break;
  }

  // The wreckage: n_alloys = sqrtf(sqrtf(mass / 6000)) (7916), the block at
  // 8044, n_wreckage at 8055, the per-wreck draws at 8060-8066 and Universe.m
  // 5503-5513.
  let nAlloys = Math.sqrt(Math.sqrt(hull.mass / 6000));
  const wrecks: OracleWreck[] = [];
  let wreckCount = 0;
  if (canFragment && nAlloys > 0) {
    wreckCount = nAlloys < 3 ? Math.floor(u() * (nAlloys + 2)) : 3;
    for (let i = 0; i < wreckCount; i += 1) {
      const octants: number[] = [];
      for (let k = 0; k < 7; k += 1) octants.push(Math.floor(u() * 8));
      const lifetime = 750 * u() + 250 * i + 100;
      const model = CONTENT.wrecks[Math.floor(u() * CONTENT.wrecks.length)];
      if (model === undefined) throw new Error("no oracle wreck model");
      const expectedMass = 0.1 * hull.mass * (0.75 + 0.5 * u());
      const qw = Math.floor(u() * 1024) - 511.5;
      const qx = Math.floor(u() * 1024) - 511.5;
      const qy = Math.floor(u() * 1024) - 511.5;
      const qz = Math.floor(u() * 1024) - 511.5;
      const push = u();
      const r1 =
        victim.octree === undefined
          ? vec(0, 0, 0)
          : oracleRandomFullNode(
              victim.octree.root,
              victim.octree.radius,
              octants,
              0,
              vec(0, 0, 0),
            );
      const local = vec(r1.x, r1.y, r1.z === 0 ? 0 : -r1.z);
      const dir = rotate(victim.orientation ?? identity(), local);
      const radius = model.radius * Math.cbrt(expectedMass / model.mass);
      const normal = normalizeVec(dir);
      const released = vec(
        victim.velocity.x + normal.x * (push * radius),
        victim.velocity.y + normal.y * (push * radius),
        victim.velocity.z + normal.z * (push * radius),
      );
      wrecks.push({
        specKey: model.key,
        position: vec(
          victim.position.x + dir.x,
          victim.position.y + dir.y,
          victim.position.z + dir.z,
        ),
        velocity: released,
        released,
        orientation: normalize(quat(qw, qx, qy, qz)),
        radius,
        energy: lifetime / 2,
      });
    }
    nAlloys = u() * nAlloys; // 8068
  }

  // The plates (8072-8111): no role draw (D16-07), placed and moving as a pod.
  const plateCount = canFragment ? Math.floor(nAlloys) : 0;
  const plates: OraclePod[] = [];
  for (let i = 0; i < plateCount; i += 1) plates.push(scatter());

  // The blast (8123-8126, 7680-7698, 11178-11181) over every piece in spawn
  // (ascending id) order.
  const amount = 0.125 * hull.mass;
  const desiredRange = (victim.radius ?? 30) * 2.5;
  const kick = (
    piece: { position: Vec3; velocity: Vec3 },
    ecr: number,
    mass: number,
  ): void => {
    const p2 = vec(
      piece.position.x - victim.position.x,
      piece.position.y - victim.position.y,
      piece.position.z - victim.position.z,
    );
    const magnitude2 = p2.x * p2.x + p2.y * p2.y + p2.z * p2.z;
    const reach = desiredRange + ecr;
    if (!(magnitude2 < reach * reach) || magnitude2 === 0) return;
    let d2 = magnitude2 - ecr * ecr;
    if (d2 < 0.1) d2 = 0.1;
    const moment = (amount * desiredRange) / d2;
    const n = normalizeVec(p2);
    const k = moment / mass;
    piece.velocity = vec(
      oracleClamp(piece.velocity.x + n.x * k),
      oracleClamp(piece.velocity.y + n.y * k),
      oracleClamp(piece.velocity.z + n.z * k),
    );
  };
  for (const pod of pods) {
    kick(
      pod,
      FIXTURE_POD.radius,
      FIXTURE_POD.mass * (FIXTURE_POD.radius / FIXTURE_POD.radius) ** 3,
    );
  }
  for (const wreck of wrecks) {
    const model = CONTENT.wrecks.find((w) => w.key === wreck.specKey);
    if (model === undefined) throw new Error("no oracle wreck model");
    kick(wreck, wreck.radius, model.mass * (wreck.radius / model.radius) ** 3);
  }
  for (const plate of plates) {
    kick(
      plate,
      FIXTURE_PLATE.radius,
      FIXTURE_PLATE.mass * (FIXTURE_PLATE.radius / FIXTURE_PLATE.radius) ** 3,
    );
  }
  return {
    canFragment,
    pods,
    wreckCount,
    wrecks,
    plates,
    draws,
    finalState: rng.s,
  };
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
    readonly specKey?: string;
  } = {},
): Entity {
  const result = spawnEntity(
    world,
    {
      kind: options.kind ?? "ship",
      specKey: options.specKey ?? "adder",
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
  return world.store.live.filter(
    (e) => !e.dead && e.kind === "cargo" && e.specKey === "barrel",
  );
}

function wrecksOf(world: World): Entity[] {
  return world.store.live.filter((e) => !e.dead && e.kind === "wreckage");
}

function expectWrecksEqual(
  world: World,
  expected: readonly OracleWreck[],
): void {
  const wrecks = wrecksOf(world);
  expect(wrecks).toHaveLength(expected.length);
  wrecks.forEach((wreck, i) => {
    const want = expected[i];
    if (want === undefined) throw new Error("missing oracle wreck");
    expect(wreck.kind).toBe("wreckage");
    expect(wreck.scanClass).toBe("CLASS_NO_DRAW");
    expect(wreck.ai).toBeNull();
    expect(wreck.energyRechargeRate).toBe(0);
    expect(wreck.speed).toBe(0);
    expect(wreck.specKey).toBe(want.specKey);
    expect(wreck.position).toEqual(want.position);
    expect(wreck.velocity).toEqual(want.velocity);
    expect(wreck.orientation).toEqual(want.orientation);
    expect(wreck.radius).toBe(want.radius);
    expect(wreck.energy).toBe(want.energy);
    expect(wreck.maxEnergy).toBe(want.energy);
  });
}

function platesOf(world: World): Entity[] {
  return world.store.live.filter(
    (e) => !e.dead && e.kind === "cargo" && e.specKey === "alloy",
  );
}

function expectPlatesEqual(world: World, expected: readonly OraclePod[]): void {
  const plates = platesOf(world);
  expect(plates).toHaveLength(expected.length);
  plates.forEach((plate, i) => {
    const want = expected[i];
    if (want === undefined) throw new Error("missing oracle plate");
    expect(plate.scanClass).toBe("CLASS_CARGO");
    expect(plate.radius).toBe(FIXTURE_PLATE.radius);
    expect(plate.energy).toBe(1);
    expect(plate.maxEnergy).toBe(1);
    expect(plate.ai).toBeNull();
    expect(plate.position).toEqual(want.position);
    expect(plate.velocity).toEqual(want.velocity);
    expect(plate.orientation).toEqual(want.orientation);
  });
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
  withOctrees = false,
): { oracle: OracleResult; events: SimEvent[] } {
  const octree = withOctrees ? HULLS.get(victim.specKey)?.octree : undefined;
  const expected = oracle({
    stream: victim.rng.combat,
    cargo: victim.cargo,
    position: victim.position,
    velocity: victim.velocity,
    box: boxOf(victim.specKey),
    specKey: victim.specKey,
    orientation: victim.orientation,
    radius: victim.radius,
    ...(octree === undefined ? {} : { octree }),
  });
  const events: SimEvent[] = [];
  const ctx: DebrisContext = withOctrees
    ? { ...context(), octrees: HULLS }
    : context();
  expect(killShip(world, victim.id, PLAYER_KILLER, events, ctx)).toBe(true);
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
    // resolveShots passes the loaded hull table, so the wrecks use the octree.
    const octree = HULLS.get("adder")?.octree;
    if (octree === undefined) throw new Error("no adder octree");
    const expected = oracle({
      stream: victim.rng.combat,
      cargo: 10,
      position: victim.position,
      velocity: victim.velocity,
      box: boxOf("adder"),
      octree,
    });

    const events = stepOnce(player, world, combat, FIRE, debrisOptions());

    expect(events.filter((e) => e.kind === "shipDestroyed")).toHaveLength(1);
    expect(world.store.get(victim.id)).toBeUndefined();
    const pods = podsOf(world);
    // Pinned after measuring (world seed 7).
    expect(pods).toHaveLength(PINNED_POD_COUNT);
    expectPodsEqual(world, expected.pods);
    expectWrecksEqual(world, expected.wrecks);
    expectPlatesEqual(world, expected.plates);
    expect(victim.rng.combat).toBe(expected.finalState);
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
    // Plan 16-02's pinned pod is unchanged: the wreck and plate draws come
    // after it. Its release velocity is the pinned one; the blast then adds
    // the oracle's kick (plan 16-04).
    expect(first.position).toEqual(PINNED_FIRST_POSITION);
    expect(expected.pods[0]?.released).toEqual(PINNED_FIRST_VELOCITY);
    expect(first.velocity).toEqual(expected.pods[0]?.velocity);
    expect(first.velocity).not.toEqual(PINNED_FIRST_VELOCITY);
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
        expectWrecksEqual(world, expected.wrecks);
        expectPlatesEqual(world, expected.plates);
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

  it("advances the victim stream by 1 + capsules examined + 13 x survivors, then the wreck and plate draws", () => {
    let fragmented = 0;
    let wrecked = 0;
    let platesSeen = 0;
    for (const cargo of [0, 1, 3, 20, 200]) {
      for (const seed of [11, 12, 13, 14, 15, 16]) {
        const world = createWorld(seed);
        const victim = spawnShip(world, { cargo });
        const start = victim.rng.combat;
        killAndOracle(world, victim);
        const survivors = podsOf(world).length;
        const wrecks = wrecksOf(world).length;
        // Count the capsules the C examines: stop after the 15th survivor.
        const probe = createRngState(start);
        const canFragment =
          rngNext(probe) < (CONTENT.hulls.get("adder")?.fragmentChance ?? 0);
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
        // The wreck block: the count draw, then 7 octants, lifetime, model,
        // mass, quaternion (4) and push per wreck (D16-12, D16-17), then the
        // n_alloys draw; then 13 draws per plate (D16-07: no role draw).
        const plates = platesOf(world).length;
        const wreckDraws = canFragment ? 1 + 15 * wrecks + 1 + 13 * plates : 0;
        platesSeen += plates;
        if (canFragment) fragmented += 1;
        wrecked += wrecks;
        const replay = createRngState(start);
        for (
          let k = 0;
          k < 1 + examined + 13 * survivors + wreckDraws;
          k += 1
        ) {
          rngNext(replay);
        }
        expect(victim.rng.combat).toBe(replay.s);
      }
    }
    // Non-vacuity: both branches and some wrecks were exercised.
    expect(fragmented).toBeGreaterThan(0);
    expect(fragmented).toBeLessThan(30);
    expect(wrecked).toBeGreaterThan(0);
    expect(platesSeen).toBeGreaterThan(0);
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
    // Compared at release, before the blast adds the same kick to both.
    expected.pods.forEach((pod, i) => {
      const base = still.pods[i];
      if (base === undefined) throw new Error("missing oracle pod");
      expect(pod.released).toEqual(
        vec(base.released.x + 1, base.released.y + 2, base.released.z + 3),
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

// ---------------------------------------------------------------------------
// The wreckage (ShipEntity.m:8042-8069, Universe.m:5497-5526; plan 16-04).

const HULL_KEYS = [...CONTENT.hulls.keys()];

/** Planning arithmetic: n_alloys = sqrt(sqrt(mass / 6000)) for the 29 compiled hulls. */
const N_ALLOYS: Readonly<Record<string, number>> = {
  adder: 1.2788,
  anaconda: 2.92249,
  "anaconda-pirate": 2.92249,
  asp: 1.885803,
  boa: 2.346141,
  "boa-mk2": 2.448952,
  "boa-mk2-pirate": 2.448952,
  "boa-pirate": 2.346141,
  "cobra3-alternate": 2.445903,
  "cobra3-pirate": 2.445903,
  "cobra3-trader": 2.445903,
  cobramk1: 1.7182,
  "cobramk1-alt": 1.718188,
  ferdelance: 1.72606,
  gecko: 1.424,
  krait: 1.9857,
  mamba: 1.563,
  "mamba-escort": 1.562983,
  moray: 1.7092,
  morayMED: 1.709177,
  python: 2.58163,
  "python-blackdog": 2.58163,
  "python-trader": 2.564929,
  shuttle: 1.1719,
  sidewinder: 1.43,
  "sidewinder-escort": 1.428239,
  viper: 1.5433,
  "viper-interceptor": 1.556518,
  "viper-pursuit": 1.54334,
};

function withHull(patch: Partial<DebrisHull>, key = "adder"): DebrisContent {
  const base = CONTENT.hulls.get(key);
  if (base === undefined) throw new Error(`no hull ${key}`);
  const hulls = new Map(CONTENT.hulls);
  hulls.set(key, { ...base, ...patch });
  return { ...CONTENT, hulls };
}

describe("the wreckage rule (ShipEntity.m:8042-8069)", () => {
  it("pins n_alloys for the 29 hulls, all below MAX_WRECKS", () => {
    expect(HULL_KEYS).toHaveLength(29);
    for (const key of HULL_KEYS) {
      const hull = CONTENT.hulls.get(key);
      if (hull === undefined) throw new Error(`no hull ${key}`);
      const n = Math.sqrt(Math.sqrt(hull.mass / N_ALLOYS_MASS_UNIT));
      expect(n).toBeCloseTo(N_ALLOYS[key] ?? Number.NaN, 4);
      expect(n).toBeLessThan(MAX_WRECKS);
    }
    expect(N_ALLOYS_MASS_UNIT).toBe(6000);
    expect(MAX_WRECKS).toBe(3);
    expect(OCTANT_DRAWS_PER_WRECK).toBe(7);
  });

  for (const key of HULL_KEYS) {
    it(`equals the oracle for ${key} over seeds, with and without the octree`, () => {
      let wrecks = 0;
      for (const seed of [1, 2, 3, 7, 42, 9001]) {
        for (const withOctrees of [false, true]) {
          const world = createWorld(seed);
          const victim = spawnShip(world, {
            specKey: key,
            cargo: 3,
            orientation: normalize(quat(0.9, 0.1, -0.3, 0.2)),
            velocity: vec(4, -5, 6),
          });
          const { oracle: expected } = killAndOracle(
            world,
            victim,
            withOctrees,
          );
          expectPodsEqual(world, expected.pods);
          expectWrecksEqual(world, expected.wrecks);
          expectPlatesEqual(world, expected.plates);
          expect(victim.rng.combat).toBe(expected.finalState);
          expect(expected.wreckCount).toBeLessThanOrEqual(MAX_WRECKS);
          expect(wrecksOf(world)).toHaveLength(expected.wreckCount);
          wrecks += expected.wreckCount;
        }
      }
      expect(wrecks).toBeGreaterThan(0);
    });
  }

  it("spawns no wreck when the canFragment draw fails", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = createWorld(seed);
      const victim = spawnShip(world, { cargo: 3 });
      const start = victim.rng.combat;
      const events: SimEvent[] = [];
      killShip(world, victim.id, PLAYER_KILLER, events, {
        tick: 5,
        content: withHull({ fragmentChance: 0 }),
      });
      expect(wrecksOf(world)).toHaveLength(0);
      // Only canFragment and the pods were drawn.
      const pods = podsOf(world).length;
      const probe = createRngState(start);
      rngNext(probe);
      let chance = 70;
      for (let i = 0; i < 3; i += 1) {
        if (Math.floor(rngNext(probe) * 100) < chance) {
          if (chance > 10) chance -= 30;
          for (let k = 0; k < 13; k += 1) rngNext(probe);
        }
      }
      expect(victim.rng.combat).toBe(probe.s);
      expect(pods).toBeLessThanOrEqual(3);
    }
  });

  it("takes the same draws with and without the hull table; only the wreck positions move", () => {
    let moved = 0;
    for (const seed of [1, 2, 3, 7, 42, 9001]) {
      const bare = createWorld(seed);
      const bareVictim = spawnShip(bare, { cargo: 3, specKey: "cobramk1" });
      killAndOracle(bare, bareVictim, false);
      const full = createWorld(seed);
      const fullVictim = spawnShip(full, { cargo: 3, specKey: "cobramk1" });
      killAndOracle(full, fullVictim, true);
      expect(fullVictim.rng.combat).toBe(bareVictim.rng.combat);
      expect(full.store.nextId).toBe(bare.store.nextId);
      const a = wrecksOf(bare);
      const b = wrecksOf(full);
      expect(b).toHaveLength(a.length);
      a.forEach((wreck, i) => {
        const twin = b[i];
        if (twin === undefined) throw new Error("missing twin");
        // Without the octree the wreck starts at the victim's centre.
        expect(wreck.position).toEqual(bareVictim.position);
        expect(twin.radius).toBe(wreck.radius);
        expect(twin.energy).toBe(wreck.energy);
        expect(twin.orientation).toEqual(wreck.orientation);
        if (
          twin.position.x !== wreck.position.x ||
          twin.position.y !== wreck.position.y ||
          twin.position.z !== wreck.position.z
        ) {
          moved += 1;
        }
      });
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("refuses a wreck with an empty model list or a bad model but takes every draw", () => {
    const reference = createWorld(3);
    const refVictim = spawnShip(reference, { cargo: 3 });
    killAndOracle(reference, refVictim);
    expect(wrecksOf(reference).length).toBeGreaterThan(0);
    const bad: DebrisContent[] = [
      { ...CONTENT, wrecks: [] },
      { ...CONTENT, wrecks: CONTENT.wrecks.map((w) => ({ ...w, mass: 0 })) },
      {
        ...CONTENT,
        wrecks: CONTENT.wrecks.map((w) => ({ ...w, mass: Number.NaN })),
      },
      { ...CONTENT, wrecks: CONTENT.wrecks.map((w) => ({ ...w, radius: -1 })) },
      { ...CONTENT, wrecks: null as unknown as DebrisContent["wrecks"] },
    ];
    for (const content of bad) {
      const world = createWorld(3);
      const victim = spawnShip(world, { cargo: 3 });
      killShip(world, victim.id, PLAYER_KILLER, [], { tick: 5, content });
      expect(wrecksOf(world)).toHaveLength(0);
      expect(victim.rng.combat).toBe(refVictim.rng.combat);
      for (const entity of world.store.live) {
        if (!entity.dead) expect(sanitizeEntity(entity)).toBe(false);
      }
    }
  });
});

describe("the alloy plate (ShipEntity.m:8068-8111, D16-07)", () => {
  it("throws out at most floor(n_alloys) plates for every hull (one for the nine inert hulls), none when the victim cannot fragment", () => {
    let plates = 0;
    for (const key of HULL_KEYS) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const world = createWorld(seed);
        const victim = spawnShip(world, { specKey: key, cargo: 0 });
        const { oracle: expected } = killAndOracle(world, victim);
        expectPlatesEqual(world, expected.plates);
        expect(platesOf(world).length).toBeLessThanOrEqual(
          Math.floor(N_ALLOYS[key] ?? Number.NaN),
        );
        if (!expected.canFragment) expect(platesOf(world)).toHaveLength(0);
        plates += platesOf(world).length;
      }
    }
    expect(plates).toBeGreaterThan(0);
    for (const seed of [1, 2, 3, 4, 5]) {
      const world = createWorld(seed);
      const victim = spawnShip(world, { cargo: 0, specKey: "krait" });
      killShip(world, victim.id, PLAYER_KILLER, [], {
        tick: 5,
        content: withHull({ fragmentChance: 0 }, "krait"),
      });
      expect(platesOf(world)).toHaveLength(0);
      expect(wrecksOf(world)).toHaveLength(0);
    }
  });
});

describe("the blast (ShipEntity.m:7680-7698, 8123-8126; D16-04, D-03)", () => {
  const COBRA_MASS = 52291.8359375;
  const COBRA_RADIUS = 39.260494232177734;
  const CENTRE = vec(100, 200, 300);
  const AMOUNT = BLAST_MOMENTUM_FACTOR * COBRA_MASS;
  const RANGE = COBRA_RADIUS * BLAST_RANGE_FACTOR;

  function place(
    world: World,
    kind: "cargo" | "wreckage" | "ship",
    specKey: string,
    offset: Vec3,
    radius: number,
    velocity: Vec3 = vec(0, 0, 0),
  ): Entity {
    const result = spawnEntity(
      world,
      {
        kind,
        specKey,
        scanClass:
          kind === "cargo"
            ? "CLASS_CARGO"
            : kind === "wreckage"
              ? "CLASS_NO_DRAW"
              : "CLASS_NEUTRAL",
        position: vec(
          CENTRE.x + offset.x,
          CENTRE.y + offset.y,
          CENTRE.z + offset.z,
        ),
        orientation: identity(),
        radius,
        speed: kind === "ship" ? 50 : 0,
        ai: null,
        maxEnergy: 1,
        energyRechargeRate: 0,
        velocity,
      },
      0,
    );
    if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
    return result.entity;
  }

  /** Kill a cargo-0 Cobra Mk I that cannot fragment: the blast is all that runs. */
  function blastOnly(world: World): void {
    const victim = spawnShip(world, {
      specKey: "cobramk1",
      cargo: 0,
      position: CENTRE,
    });
    victim.radius = COBRA_RADIUS;
    killShip(world, victim.id, PLAYER_KILLER, [], {
      tick: 5,
      content: withHull({ fragmentChance: 0 }, "cobramk1"),
    });
    // Placed pieces spawn on tick 0: nothing new was released on tick 5.
    expect(
      world.store.live.filter((e) => !e.dead && e.spawnTick === 5),
    ).toHaveLength(0);
  }

  it("pins the constants and the debris mass rule", () => {
    expect(BLAST_MOMENTUM_FACTOR).toBe(0.125);
    expect(BLAST_RANGE_FACTOR).toBe(2.5);
    expect(BLAST_MIN_DISTANCE_SQUARED).toBe(0.1);
    const world = createWorld(1);
    const pod = place(
      world,
      "cargo",
      "barrel",
      vec(500, 0, 0),
      FIXTURE_POD.radius,
    );
    const plate = place(
      world,
      "cargo",
      "alloy",
      vec(600, 0, 0),
      FIXTURE_PLATE.radius,
    );
    const wreck = place(
      world,
      "wreckage",
      "more-wreckage2",
      vec(700, 0, 0),
      25,
    );
    const odd = place(world, "cargo", "nonesuch", vec(800, 0, 0), 5);
    expect(debrisMassOf(pod, CONTENT)).toBe(FIXTURE_POD.mass);
    expect(debrisMassOf(plate, CONTENT)).toBe(FIXTURE_PLATE.mass);
    expect(debrisMassOf(wreck, CONTENT)).toBe(5793.83 * (25 / 18.66) ** 3);
    expect(debrisMassOf(odd, CONTENT)).toBeUndefined();
    expect(
      debrisMassOf(pod, { ...CONTENT, pod: { ...FIXTURE_POD, mass: 0 } }),
    ).toBeUndefined();
    expect(
      debrisMassOf(pod, {
        ...CONTENT,
        pod: { ...FIXTURE_POD, radius: Number.NaN },
      }),
    ).toBeUndefined();
  });

  it("kicks pods, plates and an old wreck by the ported rule; nothing beyond the range", () => {
    const world = createWorld(2);
    // A pod already drifting from an earlier kill, 15 m out along +x.
    const near = place(
      world,
      "cargo",
      "barrel",
      vec(15, 0, 0),
      FIXTURE_POD.radius,
      vec(1, 2, 3),
    );
    const close = place(
      world,
      "cargo",
      "barrel",
      vec(0, 3, 0),
      FIXTURE_POD.radius,
    );
    const plate = place(
      world,
      "cargo",
      "alloy",
      vec(0, 0, -1),
      FIXTURE_PLATE.radius,
    );
    // Outside 98.151 + 5.7986 = 103.950 m.
    const far = place(
      world,
      "cargo",
      "barrel",
      vec(104, 0, 0),
      FIXTURE_POD.radius,
    );
    const wreck = place(
      world,
      "wreckage",
      "more-wreckage2",
      vec(0, -40, 0),
      25,
    );
    blastOnly(world);

    // 15 m: 3.3747 m/s outward, added once to its own drift.
    expect(near.velocity.x - 1).toBeCloseTo(3.3747, 4);
    expect(near.velocity.x).toBe(
      1 + (AMOUNT * RANGE) / (225 - FIXTURE_POD.radius ** 2) / FIXTURE_POD.mass,
    );
    expect(near.velocity.y).toBe(2);
    expect(near.velocity.z).toBe(3);
    // 3 m: the 0.1 floor, 6458.5 m/s, below the bound.
    expect(close.velocity.y).toBeCloseTo(6458.5, 0);
    expect(close.velocity.x).toBe(0);
    // 1 m: 23,463 m/s on a plate, clamped to the bound, no repair.
    expect(plate.velocity).toEqual(vec(0, 0, -1e4));
    expect(plate.repairs).toBe(0);
    expect(sanitizeEntity(plate)).toBe(false);
    // 104 m: out of range.
    expect(far.velocity).toEqual(vec(0, 0, 0));
    // The old wreck's mass is model.mass x (radius / model.radius)^3.
    const wreckMass = 5793.83 * (25 / 18.66) ** 3;
    expect(wreck.velocity.y).toBe(
      -((AMOUNT * RANGE) / (1600 - 625) / wreckMass),
    );
    for (const entity of world.store.live) {
      if (!entity.dead) expect(sanitizeEntity(entity)).toBe(false);
    }
  });

  it("pushes a ship neighbour by its hull mass (D-03), and a player out of range is the same with or without debris", () => {
    const world = createWorld(3);
    const neighbour = place(world, "ship", "adder", vec(10, 0, 0), 30);
    const adderMass = CONTENT.hulls.get("adder")?.mass;
    if (adderMass === undefined) throw new Error("no adder hull");
    blastOnly(world);
    // 10 m, inside the Adder's own 30 m radius: d2 takes the 0.1 floor.
    expect(neighbour.velocity).toEqual(
      vec((AMOUNT * RANGE) / BLAST_MIN_DISTANCE_SQUARED / adderMass, 0, 0),
    );
    expect(neighbour.speed).toBe(50);

    const run = (options: StepOptions): FlightState => {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const w = createWorld(7);
      spawnShip(w, {
        cargo: 10,
        position: vec(FAR.x, FAR.y, FAR.z - 2000),
        maxEnergy: 10,
      });
      const events = stepOnce(player, w, combat, FIRE, options);
      expect(events.some((e) => e.kind === "shipDestroyed")).toBe(true);
      return player;
    };
    const withDebris = run(debrisOptions());
    const without = run({
      combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: HULLS },
    });
    expect(withDebris).toEqual(without);
  });
});

describe("the wreck burn-down (D16-11, ShipEntity.m:2254-2272)", () => {
  it("drains dt x (1000 - 10 x age) while above 256, else nothing", () => {
    expect(wreckHeatDrain(0, 1 / 120)).toBe((1 / 120) * 1000);
    expect(wreckHeatDrain(10, 0.5)).toBe(450);
    // 1000 - 10 x 74.4 = 256: not above, so nothing.
    expect(wreckHeatDrain(74.4, 1 / 120)).toBe(0);
    expect(wreckHeatDrain(100, 1 / 120)).toBe(0);
    expect(wreckHeatDrain(Number.NaN, 1 / 120)).toBe(0);
    expect(wreckHeatDrain(0, Number.POSITIVE_INFINITY)).toBe(0);
    expect(wreckHeatDrain(Number.NEGATIVE_INFINITY, 1 / 120)).toBe(0);
  });

  const TABLE: readonly (readonly [number, number])[] = [
    [50, 7],
    [175, 22],
    [300, 37],
    [425, 52],
    [550, 67],
    [675, 82],
  ];
  for (const [energy, ticks] of TABLE) {
    it(`removes a wreck of energy ${String(energy)} after exactly ${String(ticks)} ticks`, () => {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const world = createWorld(17);
      const spawned = spawnEntity(
        world,
        {
          kind: "wreckage",
          specKey: "wreckage-component",
          scanClass: "CLASS_NO_DRAW",
          position: vec(FAR.x + 500, FAR.y, FAR.z - 3000),
          orientation: identity(),
          radius: 17.28,
          speed: 0,
          ai: null,
          maxEnergy: energy,
          energyRechargeRate: 0,
          velocity: vec(1, 2, 3),
        },
        player.tick,
      );
      if (!spawned.ok) throw new Error("spawn refused");
      const wreck = spawned.entity;
      for (let step = 1; step <= ticks; step += 1) {
        const events = stepOnce(player, world, combat, ZERO_INTENT, {});
        const removed = events.some(
          (e) => e.kind === "entityRemoved" && e.id === wreck.id,
        );
        expect(events.some((e) => e.kind === "shipDestroyed")).toBe(false);
        if (step < ticks) {
          expect(removed).toBe(false);
          expect(wreck.energy).toBeGreaterThan(0);
          expect(wreck.repairs).toBe(0);
        } else {
          expect(removed).toBe(true);
          expect(wreck.energy).toBe(0);
          expect(wreck.repairs).toBe(0);
        }
      }
      expect(world.store.get(wreck.id)).toBeUndefined();
    });
  }
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

  it("a wreck is not hit by the laser, not a scanner contact and does not mass-lock", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(9);
    const wreck = spawnEntity(
      world,
      {
        kind: "wreckage",
        specKey: "wreckage-component",
        scanClass: "CLASS_NO_DRAW",
        position: vec(FAR.x, FAR.y, FAR.z - 1000),
        orientation: identity(),
        radius: 40,
        speed: 0,
        ai: null,
        maxEnergy: 675,
        energyRechargeRate: 0,
      },
      player.tick,
    );
    if (!wreck.ok) throw new Error("spawn refused");

    const events = stepOnce(player, world, combat, FIRE, debrisOptions());
    expect(events.some((e) => e.kind === "laserFired")).toBe(true);
    expect(events.some((e) => e.kind === "shipHit")).toBe(false);
    // Only the burn-down touched its energy, never the laser.
    expect(wreck.entity.energy).toBe(675 - wreckHeatDrain(DT, DT));
    expect(wreck.entity.dead).toBe(false);
    expect(npcContacts(world)).toHaveLength(0);
    expect(
      createShipField(world, undefined).massLocked(
        player.position,
        layout.scannerRange,
      ),
    ).toBe(false);
  });
});

describe("the blast on the player (D-03, ShipEntity.m:7680-7698, 11178-11181)", () => {
  const KRAIT_RADIUS = 50.196590423583984;
  const FLOOR_FIXTURE_ID = "blast-krait-player-floor-10m";

  function blastFixture(id: string): BlastFixture {
    const fixtures = BlastFileSchema.parse(
      JSON.parse(
        readFileSync(
          new URL(
            `../../oracles/combat/response/${BLAST_FIXTURE_FILE}`,
            import.meta.url,
          ),
          "utf8",
        ),
      ) as unknown,
    );
    const fixture = fixtures.find((f) => f.id === id);
    if (fixture === undefined) throw new Error(`no fixture ${id}`);
    return fixture;
  }

  /**
   * A Krait (energy 10, so one pulse kills it) with its centre at the player's
   * position minus `offset`, i.e. the player sits at `offset` from the Krait.
   */
  function krait(world: World, player: FlightState, offset: Vec3): Entity {
    const ship = spawnShip(world, {
      specKey: "krait",
      cargo: 0,
      maxEnergy: 10,
      position: vec(
        player.position.x - offset.x,
        player.position.y - offset.y,
        player.position.z - offset.z,
      ),
    });
    ship.radius = KRAIT_RADIUS;
    return ship;
  }

  it("throws the player clear by the 18-03 floor fixture, then the drift brakes to rest", () => {
    const fixture = blastFixture(FLOOR_FIXTURE_ID);
    const victim = fixture.victims[0];
    const receiver = fixture.receivers[0];
    const contribution = fixture.expected.receivers[0]?.contributions[0];
    const expected = fixture.expected.receivers[0]?.dv;
    if (
      victim === undefined ||
      receiver === undefined ||
      contribution === undefined ||
      !expected
    ) {
      throw new Error("fixture shape");
    }
    expect(victim.mass).toBe(CONTENT.hulls.get("krait")?.mass);
    expect(victim.radius).toBe(KRAIT_RADIUS);
    expect(contribution.floored).toBe(true);
    // The fixture puts the player 10 m from the Krait's centre, so d2 takes
    // the 0.1 floor and the push does not depend on the distance inside the
    // player's own radius (72.697 m). The pulse cannot hit a Krait from inside
    // its hull, so the Krait sits 60 m ahead (also floored): the same speed,
    // along the unit vector from the Krait (+z here).
    const magnitude = Math.hypot(expected[0], expected[1], expected[2]);
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    krait(world, player, vec(0, 0, 60));
    const events = stepOnce(player, world, combat, FIRE, debrisOptions());
    expect(events.some((e) => e.kind === "shipDestroyed")).toBe(true);
    expect(player.drift.x).toBe(0);
    expect(player.drift.y).toBe(0);
    expect(
      withinTolerance(player.drift.z, magnitude, fixture.tolerance),
      `drift z ${player.drift.z} vs ${magnitude}`,
    ).toBe(true);

    // It then brakes by the Cobra's raw thrust, 32 m/s^2, to exactly zero.
    const speed = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
    const start = speed(player.drift);
    stepOnce(player, world, combat, ZERO_INTENT, debrisOptions());
    expect(start - speed(player.drift)).toBeCloseTo(32 / 120, 5);
    let ticks = 1;
    while (speed(player.drift) > 0 && ticks < 400) {
      stepOnce(player, world, combat, ZERO_INTENT, debrisOptions());
      ticks += 1;
    }
    expect(speed(player.drift)).toBe(0);
    expect(ticks).toBe(Math.ceil(start / (32 / 120)));
  });

  it("leaves the player's drift exactly zero 400 m away (range plus radius is about 198 m)", () => {
    const player = flyingPlayer();
    const combat = createPlayerCombatState();
    const world = createWorld(7);
    krait(world, player, vec(0, 0, 400));
    const events = stepOnce(player, world, combat, FIRE, debrisOptions());
    expect(events.some((e) => e.kind === "shipDestroyed")).toBe(true);
    expect(player.drift).toEqual(vec(0, 0, 0));
  });

  it("never pushes a launching or a docked player, and nothing without debris content", () => {
    const offset = vec(0, 0, 60);
    const run = (
      mode: FlightState["mode"],
      options: StepOptions,
    ): FlightState => {
      const player = flyingPlayer();
      const combat = createPlayerCombatState();
      const world = createWorld(7);
      krait(world, player, offset);
      const shot = {
        shooter: PLAYER_ID,
        ray: playerLaserRay(
          player.position,
          player.orientation,
          "fore",
          "EQ_WEAPON_PULSE_LASER",
        ),
        laser: "EQ_WEAPON_PULSE_LASER",
      } as const;
      player.mode = mode;
      const events = resolveShots(
        world,
        true,
        player,
        combat,
        [shot],
        options,
        DT,
        layout,
      );
      expect(events.some((e) => e.kind === "shipDestroyed")).toBe(true);
      return player;
    };
    // The control: the same shot in flight pushes.
    expect(run("inFlight", debrisOptions()).drift).not.toEqual(vec(0, 0, 0));
    expect(run("launching", debrisOptions()).drift).toEqual(vec(0, 0, 0));
    expect(run("docked", debrisOptions()).drift).toEqual(vec(0, 0, 0));
    const bare: StepOptions = {
      combat: { mounts: DEFAULT_LASER_MOUNTS, hulls: HULLS },
    };
    expect(run("inFlight", bare).drift).toEqual(vec(0, 0, 0));
  });
});
