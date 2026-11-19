// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cross-cadence replay of an opted-in fight, and a mid-fight snapshot (QUAL-11,
 * ROADMAP Phase 17 criterion 1; plan 17-09, D-09, D-17).
 *
 * One tick-indexed scenario: the player is parked in flight at the far region
 * with a combat state, and three opted-in shooters run beside it for 1,200 ticks (ten
 * simulated seconds). A flight-script Viper attacks an inert, very sturdy Adder
 * through the steering route (`fire: true`, an attack behaviour's own fire
 * sites), and a test-pilot Viper holds the player and shoots at it through its
 * per-tick ask. Every shot of both passes the NPC fire gate, so the rate of fire
 * is the gate's (heat, energy, the whole-tick timer, the range roll, `onTarget`)
 * and not the frame rate's.
 *
 * The tick-indexed `hashWorld` log (the world, the flight and the player's
 * combat line) and the list of shot ticks must be identical when the frames that
 * drive the accumulator arrive at 30, 60 or 144 Hz. The log is indexed by TICK,
 * never by frame: a frame-indexed log is chunked differently at each cadence and
 * is the classic false failure. The frame runner is a copy of the one in
 * `tests/sim/npc/npc-cadence.test.ts` (itself a copy of the world-cadence one):
 * the runner is a few lines of accumulator arithmetic that must not be shared
 * with the code under test, so each cadence test carries its own.
 *
 * The snapshot case takes a world mid-fight at a tick boundary, with heat, a
 * non-zero `missedShots` and a `lastShotTick` set, through `snapshotWorld`, JSON
 * and `restoreWorld`: every entity, weapon record (the float32 temperature
 * survives JSON) and AI params (the `fire` key survives the param domain) of the
 * restored world equals the original, and the world hashes the same at that tick.
 * Replay after the boundary is Phase 15's snapshot-boundary property and is not
 * repeated here (review Sonnet LOW-1).
 */

import { describe, expect, it } from "vitest";

import { createFlightScriptAi } from "../../../src/sim/ai/pilots/flight-script.js";
import { createTestPilotAi } from "../../../src/sim/ai/pilots/test-pilot.js";
import { DEFAULT_LASER_MOUNTS } from "../../../src/sim/combat/mounts.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { PlayerCombatState } from "../../../src/sim/combat/state.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { stepFlight } from "../../../src/sim/flight/step.js";
import type { StepOptions } from "../../../src/sim/flight/step.js";
import { clampFrameDelta } from "../../../src/sim/loop.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT, MAX_STEPS_PER_FRAME } from "../../../src/sim/time.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";
import { MAX_ENTITY_ENERGY } from "../../../src/sim/world/limits.js";
import { entityHashes, hashWorld } from "../../../src/sim/world/serialize.js";
import {
  parseWorldSnapshot,
  restoreWorld,
  snapshotWorld,
} from "../../../src/sim/world/snapshot.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realHullTable } from "../../helpers/hull-table.js";
import { laveFixture } from "../../helpers/lave.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import { realNpcWeapons } from "../../helpers/npc-weapons.js";

const { layout, config } = laveFixture();

const OPTIONS: StepOptions = {
  npcFlight: realNpcFlightTable(),
  combat: {
    mounts: DEFAULT_LASER_MOUNTS,
    hulls: realHullTable(),
    npcWeapons: realNpcWeapons(),
  },
};

/** Far from the station and the planet, so nothing mass-locks the player. */
const FAR = vec(1e7, 0, 0);

/** The fight runs this many ticks after the spawn: ten simulated seconds. */
const FIGHT_TICKS = 1_200;

/**
 * The test-pilot shooter's energy. At 0.5 a shot and no recharge it can shoot
 * about 39 times, so at most 6 x 39 points reach the player: the 128 shield and
 * about 110 of the 256 energy, never the whole bank.
 */
const SHOOTER_ENERGY = 20;

/** The stray shooter's energy: more than its few shots can spend. */
const STRAY_ENERGY = 20;

/** The snapshot of the round-trip case is taken this many ticks into the fight. */
const SNAPSHOT_AFTER = 600;

/** The stray shooter's hand-set accuracy (the draw is -5 to 5). */
const STRAY_ACCURACY = 0;

/** A player launched, skipped to flight, parked at `FAR`, nose to -Z. */
function flyingPlayer(): FlightState {
  const state = initFlightState(layout);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "launch" }], DT);
  stepFlight(state, layout, config, ZERO_INTENT, [{ kind: "skipLaunch" }], DT);
  state.position = FAR;
  state.orientation = identity();
  state.speed = 0;
  return state;
}

/** One shot, as the `laserFired` events of a tick report it. */
interface Shot {
  readonly tick: number;
  readonly shooter: number;
}

/** What the scenario records; compared across cadences. */
interface Log {
  readonly hashes: Map<number, string>;
  readonly shots: Shot[];
  readonly startTick: number;
  endTick: number;
  /** The ids of the two shooters, in spawn order: the attacker, the pilot. */
  readonly attacker: number;
  readonly pilot: number;
  /** The shooter whose beams pass beside its target. */
  readonly stray: number;
}

/** The fight itself: the world, the player and the log, stepped tick by tick. */
class Fight {
  readonly state: FlightState = flyingPlayer();
  readonly combat: PlayerCombatState = createPlayerCombatState();
  readonly world: World = createWorld(7);
  readonly log: Log;
  done = false;

  constructor() {
    const spawn = (
      specKey: string,
      position: Vec3,
      extra: Record<string, unknown>,
    ): number => {
      const result = spawnEntity(
        this.world,
        {
          kind: "ship",
          specKey,
          scanClass: "CLASS_NEUTRAL",
          position,
          orientation: identity(),
          radius: 30,
          speed: 0,
          maxEnergy: 85,
          energyRechargeRate: 0,
          ...extra,
        },
        this.state.tick,
      );
      if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
      return result.entity.id;
    };
    // The attacker's victim: an Adder 3 km ahead of the attacker that no beam
    // can empty in the run.
    const adder = spawn("adder", vec(FAR.x + 5_000, FAR.y, FAR.z - 3_000), {
      maxEnergy: MAX_ENTITY_ENERGY,
    });
    const attacker = spawn("viper", vec(FAR.x + 5_000, FAR.y, FAR.z), {
      maxEnergy: 180,
      ai: createFlightScriptAi(this.state.tick, {
        script: "attack",
        targetId: adder,
        fire: true,
      }),
    });
    // The pilot holds the player 1 km ahead of it on its nose... the player is
    // at the far region's origin, so the pilot sits in front of the player.
    const holder = createTestPilotAi(this.state.tick, {
      fire: true,
      holdRange: 5_000,
    });
    holder.params["phase"] = "hold";
    holder.params["targetId"] = PLAYER_ID;
    const pilot = spawn("viper", vec(FAR.x, FAR.y, FAR.z - 1_000), {
      maxEnergy: SHOOTER_ENERGY,
      ai: holder,
      orientation: { w: 0, x: 0, y: 1, z: 0 },
    });
    // A third shooter whose beam passes beside its target. Its accuracy is set
    // to 0 by hand: the aim circle (`currentAimTolerance`) is then cos 0.99971,
    // about 2 degrees wide, so a target 2,000 m ahead and 50 m to the side
    // (0.025 rad) is "on target" and the gate lets the shot out, while the ray
    // along the nose passes 50 m from the 30 m Adder and misses. Each miss adds
    // one to its `missedShots`, which tightens the circle until the shooter
    // stops asking to fire (after about two misses).
    const stray = createTestPilotAi(this.state.tick, {
      fire: true,
      holdRange: 5_000,
    });
    stray.params["phase"] = "hold";
    const decoy = spawn("adder", vec(FAR.x - 4_950, FAR.y, FAR.z - 2_000), {
      maxEnergy: MAX_ENTITY_ENERGY,
    });
    stray.params["targetId"] = decoy;
    const strayer = spawn("viper", vec(FAR.x - 5_000, FAR.y, FAR.z), {
      maxEnergy: STRAY_ENERGY,
      ai: stray,
    });
    const strayEntity = this.world.store.get(strayer);
    if (strayEntity === undefined) throw new Error("the stray shooter is gone");
    strayEntity.steer.accuracy = STRAY_ACCURACY;
    this.log = {
      hashes: new Map(),
      shots: [],
      startTick: this.state.tick,
      endTick: -1,
      attacker,
      pilot,
      stray: strayer,
    };
  }

  /** One fixed step of the scenario. */
  step(): void {
    const { state, world, combat, log } = this;
    const events = stepSim(
      state,
      world,
      layout,
      config,
      ZERO_INTENT,
      [],
      DT,
      OPTIONS,
      combat,
    );
    for (const event of events) {
      if (event.kind === "laserFired") {
        log.shots.push({ tick: state.tick, shooter: event.shooter });
      }
    }
    log.hashes.set(state.tick, hashWorld(state, world, combat));
    if (state.tick >= log.startTick + FIGHT_TICKS) {
      log.endTick = state.tick;
      this.done = true;
    }
  }
}

/**
 * The frame runner of tests/sim/npc/npc-cadence.test.ts: clamp the frame delta,
 * run whole 1/120 s steps, cap catch-up at five steps per frame and drop the
 * backlog after a stall. It steps the fight until the fight is done.
 */
function replay(hz: number): Fight {
  const fight = new Fight();
  let accumulator = 0;
  for (let frame = 0; !fight.done; frame += 1) {
    if (frame > 200_000) {
      throw new Error(`cadence ${String(hz)} never finished`);
    }
    accumulator += clampFrameDelta(1 / hz);
    let stepsThisFrame = 0;
    while (
      accumulator >= DT &&
      stepsThisFrame < MAX_STEPS_PER_FRAME &&
      !fight.done
    ) {
      fight.step();
      accumulator -= DT;
      stepsThisFrame += 1;
    }
    if (stepsThisFrame === MAX_STEPS_PER_FRAME) accumulator = 0;
  }
  return fight;
}

const CADENCES = [30, 60, 144] as const;
const fights = new Map<number, Fight>(CADENCES.map((hz) => [hz, replay(hz)]));
const reference = (fights.get(60) as Fight).log;

const entriesOf = (log: Log): [number, string][] =>
  [...log.hashes.entries()].sort((a, b) => a[0] - b[0]);

describe("an opted-in fight at 30, 60 and 144 Hz (QUAL-11, criterion 1, D-17)", () => {
  it("hashes the world, the flight and the player's combat state identically on every tick", () => {
    expect(reference.hashes.size).toBe(FIGHT_TICKS);
    for (const hz of CADENCES) {
      const log = (fights.get(hz) as Fight).log;
      expect(entriesOf(log)).toEqual(entriesOf(reference));
    }
  });

  it("fires on the same ticks at every frame rate, and fires at least 20 shots from each route", () => {
    const of = (log: Log, shooter: number): number[] =>
      log.shots.filter((s) => s.shooter === shooter).map((s) => s.tick);
    // Non-vacuity: the steering route and the per-tick ask both fire a lot.
    expect(of(reference, reference.attacker).length).toBeGreaterThanOrEqual(20);
    expect(of(reference, reference.pilot).length).toBeGreaterThanOrEqual(20);
    for (const hz of CADENCES) {
      const log = (fights.get(hz) as Fight).log;
      expect(log.shots).toEqual(reference.shots);
      expect(log.endTick).toBe(reference.endTick);
      expect(log.endTick).toBe(log.startTick + FIGHT_TICKS);
    }
  });

  it("never fires twice within a gate period: no two shots of one ship closer than 12 ticks", () => {
    for (const shooter of [
      reference.attacker,
      reference.pilot,
      reference.stray,
    ]) {
      const ticks = reference.shots
        .filter((s) => s.shooter === shooter)
        .map((s) => s.tick);
      for (let i = 1; i < ticks.length; i += 1) {
        expect((ticks[i] as number) - (ticks[i - 1] as number)).toBeGreaterThan(
          11,
        );
      }
    }
  });

  it("the stray shooter's beams miss: it fires, its missed-shot counter rises and it stops (the aim circle tightens)", () => {
    const fight = fights.get(60) as Fight;
    const shots = fight.log.shots.filter((s) => s.shooter === fight.log.stray);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    const stray = fight.world.store.get(fight.log.stray);
    expect(stray?.weapon.missedShots).toBe(shots.length);
    const decoy = [...fight.world.store.live].find(
      (entity) =>
        entity.specKey === "adder" && entity.energy === MAX_ENTITY_ENERGY,
    );
    expect(decoy).toBeDefined();
  });

  it("hurts the player and the Adder: the fight moves the world, so the equality is not vacuous", () => {
    const fight = fights.get(60) as Fight;
    expect(fight.combat.fwdShield).toBeLessThan(128);
    const adder = [...fight.world.store.live].find(
      (entity) => entity.specKey === "adder",
    );
    expect(adder?.energy).toBeLessThan(MAX_ENTITY_ENERGY);
  });
});

describe("a world snapshotted mid-fight restores equal (D-17)", () => {
  it("restores every entity, weapon record and AI param, and hashes the same at the snapshot tick", () => {
    const fight = new Fight();
    // Run to a tick boundary mid-fight, then check what the plan asks the
    // snapshot to carry: a hot weapon, a last-shot tick and missed shots.
    while (fight.state.tick < fight.log.startTick + SNAPSHOT_AFTER)
      fight.step();
    const found = fight.state.tick;
    const live = [...fight.world.store.live];
    expect(live.some((entity) => entity.weapon.temperature > 0)).toBe(true);
    expect(live.some((entity) => entity.weapon.lastShotTick > 0)).toBe(true);
    expect(live.some((entity) => entity.weapon.missedShots > 0)).toBe(true);
    expect(found).toBeLessThan(fight.log.startTick + FIGHT_TICKS);

    const text = JSON.stringify(snapshotWorld(fight.world));
    const restored = restoreWorld(
      parseWorldSnapshot(JSON.parse(text) as unknown),
    );
    expect(restored.store.live).toHaveLength(fight.world.store.live.length);
    expect(restored.store.live).toEqual(fight.world.store.live);
    // The pieces the plan names, one by one: the float32 temperature, the
    // timers and the AI params (the fire key) survive.
    for (const entity of fight.world.store.live) {
      const twin = restored.store.get(entity.id);
      expect(twin?.weapon).toEqual(entity.weapon);
      expect(twin?.ai?.params).toEqual(entity.ai?.params);
      expect(twin?.ai?.params["fire"]).toBe(entity.ai?.params["fire"]);
    }
    const shooters = [...fight.world.store.live].filter(
      (entity) => entity.ai?.params["fire"] === true,
    );
    expect(shooters).toHaveLength(3);
    const heated = [...fight.world.store.live].find(
      (entity) => entity.weapon.temperature > 0,
    );
    expect(heated).toBeDefined();
    if (heated !== undefined) {
      const twin = restored.store.get(heated.id);
      expect(twin?.weapon.temperature).toBe(heated.weapon.temperature);
      expect(
        Object.is(
          Math.fround(heated.weapon.temperature),
          twin?.weapon.temperature,
        ),
      ).toBe(true);
    }
    expect(entityHashes(restored)).toEqual(entityHashes(fight.world));
    expect(hashWorld(fight.state, restored, fight.combat)).toBe(
      hashWorld(fight.state, fight.world, fight.combat),
    );
    expect(fight.log.hashes.get(found)).toBe(
      hashWorld(fight.state, restored, fight.combat),
    );
  });
});
