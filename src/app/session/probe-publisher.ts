// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The read-only probe publisher (Phase 8, D-12 step 2, ARCHITECTURE.md 4.2).
 *
 * Everything the session publishes on `window.__wegolite` and the `?test=1`
 * hook lives here: the per-frame probe fields, the economy and save probes, the
 * test hook binding and the two dev-seam profile mutations. The bodies are the
 * ones `createGameSession` carried before the split, reading live fields
 * through `ctx` at every call (G-8) and publishing the identical field set; the
 * probe shape is frozen (D-13).
 *
 * The publisher owns no state of its own. `updateProbe`, `syncEconomyProbe` and
 * `syncSaveProbe` only read the session; `bindTestHook` is the one writer, and
 * it only points the hook at the live flight state.
 *
 * Plan 08-16 (D-13, the one deliberate post-split probe change) adds `probe.sim`
 * (published only while a flight state exists, deleted otherwise and on
 * `withdrawProbe`) and the two sim hook members, `worldHash` (computed on demand
 * from the live state and world, never per frame) and `advanceTicks` (delegated
 * to the sim driver, which owns the manual-clock refusal rule).
 *
 * Plan 13-14 adds `probe.combat` (values and a lock flag from the player's
 * combat state, never an entity id) and the hook member `spawnTestShooter`.
 * Plan 14-18 adds the hook member `spawnTestFlyers` (three scripted flying NPCs).
 * Plan 17-10 adds `spawnTestAttacker` (one Viper that attacks the player and fires).
 * Plan 21-16 adds `spawnTestAnarchy` (one inert ship of every catalogue record).
 */

import type * as THREE from "three";
import { capacityPodsFor, holdPodsUsed } from "../../sim/economy/cargo.js";
import type { FlightState } from "../../sim/flight/state.js";
import type { Vec3 } from "../../sim/math.js";
import { SINGLE_INSTANCE_KEYS } from "../../sim/player/outfitting.js";
import { MAX_EQUIPMENT_KEYS, setCredits } from "../../sim/player/profile.js";
import type { PlayerProfile } from "../../sim/player/profile.js";
import {
  TEST_SHOOTER_KEY,
  spawnTestAnarchy,
  spawnTestAttacker,
  spawnTestFlyers,
  spawnTestShooter,
} from "../../sim/ai/test-spawn.js";
import { identTargetSnapshot } from "../../sim/combat/ident.js";
import { portQuaternion } from "../../sim/dock/port-frame.js";
import { hashWorld } from "../../sim/world/serialize.js";
import { liveEntityCount } from "../../sim/world/world.js";
import { maxRelativeMagnitude } from "../../render/sync.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import { createTestHook, readMemory } from "../probe.js";
import type {
  WegoliteProbe,
  WegoliteSaveProbe,
  WegoliteSimTestHook,
} from "../probe.js";
import type { LaunchSequence } from "../launch-sequence.js";
import type { RedrawGate } from "../redraw-gate.js";
import type { SceneManager } from "../scene-manager.js";
import type { SessionState } from "./context.js";
import { testFlyerRecords } from "./traffic.js";

/** What the publisher calls outside the probe. */
export interface ProbePublisherDeps {
  readonly probe: WegoliteProbe;
  readonly renderer: THREE.WebGLRenderer;
  readonly scenes: Pick<SceneManager, "quality">;
  readonly saveProbe: WegoliteSaveProbe;
  readonly redrawGate: RedrawGate;
  readonly messages: MessageQueue;
  /** Commit an accepted profile change (refresh the station, notify the seam). */
  readonly commitProfile: (next: PlayerProfile) => boolean;
  /** The two scene operations the `?test=1` hook drives. */
  readonly swapSystem: () => Promise<void>;
  readonly disposeSystem: () => void;
  /**
   * The sim driver's `advanceTicks`, late-bound by the facade so construction
   * order never matters. The driver owns the refusal rule.
   */
  readonly advanceTicks: (n: number) => number;
  /** The launch pre-roll timer, published as `launch.preRolling` (quick 261118-os8). */
  readonly launchSequence: Pick<
    LaunchSequence,
    "preRolling" | "preRollElapsed"
  >;
}

export interface ProbePublisher {
  /** Publish the per-frame probe fields from the live session. */
  updateProbe: () => void;
  /** Point the `?test=1` hook at `activeState`; boot and every in-session Load. */
  bindTestHook: (activeState: FlightState) => void;
  /**
   * Record a `?test=1` live-state mutation: taint the profile and request a
   * redraw. The hook's mutate callback is this function itself.
   */
  markHookMutation: () => void;
  /** Publish the live economy and station probes. */
  syncEconomyProbe: () => void;
  /** Publish the save bookkeeping into the save probe. */
  syncSaveProbe: () => void;
  /** Remove the hook, save and Save/Load screen probes from the page object. */
  withdrawProbe: () => void;
}

export function toTuple(position: Vec3): [number, number, number] {
  return [position.x, position.y, position.z];
}

export function createProbePublisher(
  ctx: SessionState,
  deps: ProbePublisherDeps,
): ProbePublisher {
  const {
    probe,
    renderer,
    scenes,
    saveProbe,
    redrawGate,
    messages,
    commitProfile,
    swapSystem,
    disposeSystem,
    advanceTicks,
    launchSequence,
  } = deps;

  function syncEconomyProbe(): void {
    const currentMarket = ctx.core.market;
    if (currentMarket === undefined || ctx.core.marketSeed === undefined)
      return;
    const pendingProbe =
      ctx.station.stationPending === null
        ? null
        : "kind" in ctx.station.stationPending
          ? { kind: "fit" as const, key: ctx.station.stationPending.key }
          : { kind: "trade" as const, key: ctx.station.stationPending.key };
    probe.economy = {
      credits: ctx.core.profile.credits,
      cargo: { ...ctx.core.profile.cargo },
      marketSeed: ctx.core.marketSeed,
      marketSystemId: currentMarket.systemId,
      market: currentMarket.goods.map((good) => ({
        key: good.key,
        price: good.price,
        stock: good.stock,
      })),
      fuel: ctx.core.profile.fuel,
      missiles: ctx.core.profile.missiles,
      passengerBerths: ctx.core.profile.passengerBerths,
      holdPods: holdPodsUsed(ctx.core.profile.cargo, ctx.core.commodityUnits),
      capacityPods: capacityPodsFor(
        ctx.core.profile.equipment,
        ctx.core.profile.passengerBerths,
      ),
      lastTrade: ctx.station.lastTrade,
      damagedEquipment: [...ctx.core.profile.damagedEquipment],
    };
    probe.station = {
      open: ctx.core.state?.mode === "docked",
      screen: ctx.station.stationScreen,
      selectedKey: ctx.station.stationSelection,
      page: ctx.station.stationPage,
      pending: pendingProbe,
      message: ctx.station.stationMessage,
    };
  }

  /**
   * The one place a `?test=1` live-state mutation is recorded: the profile is
   * tainted (autosave refuses a tainted profile) and a redraw is requested. The
   * hook's mutate callback and the sim driver's `advanceTicks` both call it.
   */
  function markHookMutation(): void {
    ctx.runtime.testTainted = true;
    // The hook moved the live state under a possibly quiet loop.
    redrawGate.request();
  }

  /**
   * The world hash, read on demand from the live state and the live lifecycle
   * world (G-8: nothing captured). It is a read: no taint, no redraw request.
   * A stale hook (menu mode, or after dispose) gets the `""` sentinel rather
   * than a TypeError from `hashWorld`.
   */
  function worldHash(): string {
    const liveState = ctx.core.state;
    if (liveState === undefined || ctx.runtime.disposed) return "";
    return hashWorld(
      liveState,
      ctx.core.worldLifecycle?.world,
      ctx.core.combat,
    );
  }

  /**
   * The hook's shooter seam (CBT-07): one firing Viper 1,500 m ahead of the
   * player, in the live world. It needs a ship in flight, a live world and the
   * loaded traffic content (traffic on); anything else returns false and
   * changes nothing, taint included. The session is tainted before the world is
   * touched, so no autosave can make the spawned ship durable (T-13-27).
   *
   * `cargo` (Phase 16, D16-09) is the optional cargo capsule count, so a kill
   * of the shooter releases pods. The page may pass anything: after the taint,
   * a defined value that is not a number returns false with nothing spawned,
   * and a number is handed to the sim, whose `spawnEntity` accepts an integer
   * 0 to `MAX_ENTITY_CARGO` and refuses anything else (false, nothing spawned).
   * Absent, the spawn is exactly the Phase 15 one.
   */
  function spawnShooter(cargo?: unknown): boolean {
    const liveState = ctx.core.state;
    if (
      liveState === undefined ||
      ctx.runtime.disposed ||
      liveState.mode !== "inFlight"
    ) {
      return false;
    }
    const world = ctx.core.worldLifecycle?.world;
    const record = ctx.core.npcTraffic?.records.find(
      (candidate) => candidate.key === TEST_SHOOTER_KEY,
    );
    if (world === undefined || record === undefined) return false;
    markHookMutation();
    if (cargo === undefined) {
      return spawnTestShooter(world, liveState, record, liveState.tick);
    }
    if (typeof cargo !== "number") return false;
    return spawnTestShooter(world, liveState, record, liveState.tick, cargo);
  }

  /**
   * The hook's attacking-NPC seam (Phase 17, D-02): one Viper 3,000 m ahead of
   * the player that attacks it with Phase 14's attack behaviours and fires
   * through the NPC fire gate. For manual checks and UAT only; no browser spec.
   * It needs a ship in flight, a live world and the loaded traffic content with
   * the Viper; anything else returns false and changes nothing, taint included.
   * The session is tainted before the world is touched, so no autosave can make
   * the attacker durable (T-17-24).
   */
  function spawnAttacker(): boolean {
    const liveState = ctx.core.state;
    if (
      liveState === undefined ||
      ctx.runtime.disposed ||
      liveState.mode !== "inFlight"
    ) {
      return false;
    }
    const world = ctx.core.worldLifecycle?.world;
    const record = ctx.core.npcTraffic?.records.find(
      (candidate) => candidate.key === TEST_SHOOTER_KEY,
    );
    if (world === undefined || record === undefined) return false;
    markHookMutation();
    return spawnTestAttacker(world, liveState, record, liveState.tick);
  }

  /**
   * The hook's flying-NPC seam (WORLD-07, plan 14-18): a Shuttle flying to the
   * station, a Viper intercepting the player and an Adder fleeing it, 3,000 m
   * from the player. It needs a ship in flight, a live world, the layout and the
   * loaded traffic content with the three hulls; anything else returns false and
   * changes nothing, taint included. The session is tainted before the world is
   * touched, so no autosave can make a spawned ship durable (T-14-29). If the
   * sim spawner still refuses after it spawned a ship, the earlier ship stays,
   * the hook returns false and the session stays tainted.
   */
  function spawnFlyers(): boolean {
    const liveState = ctx.core.state;
    const liveLayout = ctx.core.layout;
    if (
      liveState === undefined ||
      liveLayout === undefined ||
      ctx.runtime.disposed ||
      liveState.mode !== "inFlight"
    ) {
      return false;
    }
    const world = ctx.core.worldLifecycle?.world;
    const traffic = ctx.core.npcTraffic;
    if (world === undefined || traffic === undefined) return false;
    const records = testFlyerRecords(traffic);
    if (records === undefined) return false;
    markHookMutation();
    return spawnTestFlyers(
      world,
      liveState,
      records,
      traffic.flight,
      liveState.tick,
      liveLayout.station.position,
    );
  }

  /**
   * The hook's full-anarchy seam (plan 21-16, QUAL-09 staged): one inert ship of
   * every record of the loaded catalogue on a ring ahead of the player, for the
   * draw-call spike. It needs a ship in flight, a live world and the loaded
   * traffic content; anything else returns false and changes nothing, taint
   * included. The session is tainted before the world is touched, so no
   * autosave can make a spawned ship durable. The sim spawner is all or nothing:
   * with no room for every ship it returns false and spawns none. If the sim
   * spawner refuses (no room, no valid record), nothing is spawned, but the
   * session stays tainted.
   */
  function spawnAnarchy(): boolean {
    const liveState = ctx.core.state;
    if (
      liveState === undefined ||
      ctx.runtime.disposed ||
      liveState.mode !== "inFlight"
    ) {
      return false;
    }
    const world = ctx.core.worldLifecycle?.world;
    const traffic = ctx.core.npcTraffic;
    if (world === undefined || traffic === undefined) return false;
    markHookMutation();
    return spawnTestAnarchy(world, liveState, traffic.records, liveState.tick);
  }

  /** The sim members of the hook, bound at call time (G-8). */
  const simHook: WegoliteSimTestHook = {
    worldHash,
    advanceTicks: (n) => advanceTicks(n),
    spawnTestShooter: spawnShooter,
    spawnTestFlyers: spawnFlyers,
    spawnTestAttacker: spawnAttacker,
    spawnTestAnarchy: spawnAnarchy,
  };

  /**
   * Point the `?test=1` hook at `activeState`. Called at boot and after every
   * in-session Load, so a hook never mutates a replaced state object (G-8).
   */
  function bindTestHook(activeState: FlightState): void {
    probe.test = createTestHook(
      activeState,
      { swapSystem, disposeSystem },
      markHookMutation,
      {
        setCredits: applyTestCredits,
        grantEquipment: applyTestEquipment,
      },
      simHook,
    );
  }

  /** `?test=1` seam: replace the balance; never persisted by the hook itself. */
  function applyTestCredits(credits: number): boolean {
    return commitProfile(setCredits(ctx.core.profile, credits));
  }

  /**
   * `?test=1` seam: grant only a key the validated catalogue knows and F3 can
   * install (`SINGLE_INSTANCE_KEYS`), so no laser and no key the repair door
   * cannot repair ever enters `equipment` (CONTEXT D-03, Pitfall 13). A damaged
   * key is refused, and both lists count against the 64-key bound, so the hook
   * cannot build a profile the save would refuse.
   */
  function applyTestEquipment(key: string): boolean {
    const catalogue = ctx.core.equipmentCatalogue;
    if (catalogue === undefined) return false;
    if (catalogue.every((item) => item.key !== key)) return false;
    if (!SINGLE_INSTANCE_KEYS.has(key)) return false;
    if (ctx.core.profile.damagedEquipment.includes(key)) return false;
    if (ctx.core.profile.equipment.includes(key)) return false;
    if (
      ctx.core.profile.equipment.length +
        ctx.core.profile.damagedEquipment.length >=
      MAX_EQUIPMENT_KEYS
    ) {
      return false;
    }
    return commitProfile({
      ...ctx.core.profile,
      equipment: [...ctx.core.profile.equipment, key],
    });
  }

  function syncSaveProbe(): void {
    saveProbe.status = ctx.save.saveStatus;
    saveProbe.attempts = ctx.save.saveAttempts;
    saveProbe.writes = ctx.save.saveWrites;
    saveProbe.committed = ctx.save.saveCommitted;
    // D-23: the probe reports the last COMMITTED revision, never the one a
    // queued write merely requested.
    saveProbe.revision = ctx.save.saveCommittedRevision;
    saveProbe.lastClock = ctx.save.saveLastClock;
    saveProbe.skipReason = ctx.save.saveSkipReason;
    saveProbe.unavailable = ctx.save.saveUnavailable;
    saveProbe.notice = ctx.save.saveScreenNotice;
  }

  function updateProbe(): void {
    probe.calls = renderer.info.render.calls;
    probe.triangles = renderer.info.render.triangles;
    probe.renders = renderer.info.render.frame;
    probe.memory = readMemory(renderer);
    probe.paused = ctx.runtime.paused;
    // DEATH-01: the death is published only while the session is latched game
    // over, a copy of the cause (a key string, never an entity id).
    const deathCause = ctx.runtime.gameOverCause;
    if (ctx.runtime.gameOver && deathCause !== undefined) {
      probe.death = {
        dead: true,
        cause:
          deathCause.culprit === undefined
            ? { damage: deathCause.damage }
            : { damage: deathCause.damage, culprit: deathCause.culprit },
      };
    } else {
      delete probe.death;
    }
    probe.systemId = ctx.core.system.id;
    probe.quality = scenes.quality();
    probe.atmosphere = ctx.core.scene?.planet.atmosphere !== undefined;
    probe.nebulae = ctx.core.scene?.nebulae?.quadCount ?? 0;
    probe.chart = {
      open: ctx.chart.chartOpen,
      camera: {
        centre: {
          x: ctx.chart.chartCamera.centre.x,
          y: ctx.chart.chartCamera.centre.y,
        },
        spanX: ctx.chart.chartCamera.spanX,
        spanY: 2 * ctx.chart.chartCamera.spanX,
      },
      ...(ctx.core.hyperspaceTargetId === undefined
        ? {}
        : { targetId: ctx.core.hyperspaceTargetId }),
      ...(ctx.chart.chartSelectedId === undefined
        ? {}
        : { selectedId: ctx.chart.chartSelectedId }),
    };
    probe.hyperspace = {
      ...(ctx.core.hyperspaceTargetId === undefined
        ? {}
        : { targetId: ctx.core.hyperspaceTargetId }),
      countdown: ctx.core.state?.hyperspaceCountdown ?? 0,
      lastJump: ctx.core.lastJump,
      lastRefusal: ctx.core.lastRefusal,
    };
    probe.saveScreen = {
      open: ctx.save.saveScreenOpen,
      row: ctx.save.saveLoad?.selection() ?? "save",
      confirming: ctx.save.saveLoad?.isConfirming() ?? false,
      notice: ctx.save.saveScreenNotice,
    };

    const currentState = ctx.core.state;
    if (currentState !== undefined) {
      probe.mode = currentState.mode;
      probe.clock = currentState.clockSeconds;
      probe.flightTime = currentState.flightTime;
      probe.position = toTuple(currentState.position);
      probe.orientation = [
        currentState.orientation.w,
        currentState.orientation.x,
        currentState.orientation.y,
        currentState.orientation.z,
      ];
      probe.speed = currentState.speed;
      probe.angular = {
        pitch: currentState.pitchRate,
        roll: currentState.rollRate,
      };
      probe.torus = {
        engaged: currentState.torus.engaged,
        factor: currentState.torus.factor,
        massLocked: currentState.torus.massLocked,
      };
      probe.launch = {
        count: currentState.launchCount,
        elapsed: currentState.launchElapsed,
        seen: ctx.core.launchSeen,
        // Quick 261118-os8: the presentation pre-roll; `mode` stays the sim's.
        preRolling: launchSequence.preRolling,
        preRollElapsed: launchSequence.preRollElapsed,
      };
      probe.dock = {
        dockCount: currentState.dockCount,
        scrapeCount: currentState.scrapeTicks,
        bounceCount: currentState.bounceCount,
        shake: ctx.core.dockFeedback.shakeStrength(currentState.flightTime),
        flash: ctx.core.dockFeedback.flashAlpha(currentState.flightTime),
        outcome: currentState.mode === "docked" ? "docked" : "inFlight",
        lastClockDelta: ctx.core.lastDockClockDelta,
      };
      // Plan 08-16: a fresh plain object of primitives, so no property is a
      // reference into the world, and no hash is computed per frame.
      const lifecycle = ctx.core.worldLifecycle;
      probe.sim = {
        tick: currentState.tick,
        epoch: lifecycle?.epoch ?? 0,
        entities:
          lifecycle?.world === undefined ? 0 : liveEntityCount(lifecycle.world),
        worldLive: lifecycle?.world !== undefined,
        traffic: ctx.runtime.testFlags.traffic,
        clock: ctx.runtime.testFlags.manualClock ? "manual" : "realtime",
      };
    } else {
      delete probe.sim;
    }

    // Plan 13-14: values only. The lock is a flag: the locked entity's id never
    // leaves the sim (T-13-28, tests/guards/entity-id-scope.test.ts).
    const combat = ctx.core.combat;
    if (combat !== undefined) {
      probe.combat = {
        view: combat.view,
        fwdShield: combat.fwdShield,
        aftShield: combat.aftShield,
        energy: combat.energy,
        laserTemp: combat.laserTemp[combat.view],
        cabinTemp: combat.cabinTemp,
        identLocked:
          identTargetSnapshot(
            combat,
            ctx.core.worldLifecycle?.world,
            ctx.core.layout,
          ) !== undefined,
      };
    } else {
      delete probe.combat;
    }

    if (probe.test !== undefined) probe.test.tainted = ctx.runtime.testTainted;
    // G-8: the queue depth is published so a proof can read a queued message
    // before and after an in-session Load.
    probe.messages = messages.size;

    const currentLayout = ctx.core.layout;
    const currentScene = ctx.core.scene;
    if (currentLayout !== undefined && currentScene !== undefined) {
      probe.bodies = [
        currentScene.planet.mesh.name,
        currentScene.sun.sun.name,
        currentScene.starfield.name,
        currentScene.station.root.name,
        currentScene.ship.name,
        currentScene.navBuoy.name,
        currentScene.witchpoint.name,
      ];
      probe.shipVisible = currentScene.ship.visible;
      probe.dust = {
        active: currentScene.dust.active,
        count: currentScene.dust.count,
      };
      const stationQuat = portQuaternion(
        currentLayout,
        currentState?.stationAngle ?? 0,
      );
      probe.world = {
        planet: toTuple(currentLayout.planet.position),
        sun: toTuple(currentLayout.sun.position),
        station: toTuple(currentLayout.station.position),
        stationKind: currentLayout.stationKind,
        // The render's own fact (null while the body is meshless), never the
        // session's: the browser proof of "the model is drawn" waits on it.
        stationModel: currentScene.station.modelKind ?? null,
        stationOrientation: [
          stationQuat.w,
          stationQuat.x,
          stationQuat.y,
          stationQuat.z,
        ],
        navBuoy: toTuple(currentLayout.navBuoy.position),
        witchpoint: toTuple(currentLayout.witchpoint.position),
        maxRelativeMagnitude: maxRelativeMagnitude(currentScene),
      };
    }

    const currentHud = ctx.runtime.hud;
    if (currentHud !== undefined) {
      const model = ctx.core.lastModel;
      probe.hud = {
        drawn: currentHud.drawn,
        elements: [...currentHud.elements],
        designScale: currentHud.designScale,
        letterbox: [currentHud.letterbox[0], currentHud.letterbox[1]],
        lift: currentHud.lift,
        contacts:
          model === undefined
            ? []
            : model.contacts
                .filter((contact) => contact.visible)
                .map((contact) => contact.id),
        compass:
          model === undefined
            ? { target: "planet", forward: false, blip: false }
            : {
                target: model.compass.target,
                forward: model.compass.forward,
                blip: model.compass.blip,
              },
        aegis: model === undefined ? "none" : model.aegis,
        message: model === undefined ? "" : model.message,
        messageRows:
          model === undefined ? [] : model.messageRows.map((row) => row.text),
        fuelText: model === undefined ? "" : model.fuelText,
        fuel: model === undefined ? 0 : model.bars.fuel,
        shieldFwd: model === undefined ? 0 : model.bars.shieldFwd,
        shieldAft: model === undefined ? 0 : model.bars.shieldAft,
        // A new array, so the probe never aliases the drawn model's banks.
        energyBanks:
          model === undefined
            ? [0, 0, 0, 0]
            : [
                model.bars.energyBanks[0],
                model.bars.energyBanks[1],
                model.bars.energyBanks[2],
                model.bars.energyBanks[3],
              ],
        hyperspaceTarget: model === undefined ? "" : model.hyperspaceTarget,
        bounds: currentHud.bounds,
      };
    }

    probe.hints =
      ctx.runtime.hints === undefined ? [] : [...ctx.runtime.hints.seen];
  }

  function withdrawProbe(): void {
    delete probe.sim;
    delete probe.combat;
    delete probe.test;
    delete probe.save;
    delete probe.saveScreen;
  }

  return {
    updateProbe,
    bindTestHook,
    markHookMutation,
    syncEconomyProbe,
    syncSaveProbe,
    withdrawProbe,
  };
}
