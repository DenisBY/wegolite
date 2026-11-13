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
 */

import type * as THREE from "three";
import { capacityPodsFor, holdPodsUsed } from "../../sim/economy/cargo.js";
import type { FlightState } from "../../sim/flight/state.js";
import type { Vec3 } from "../../sim/math.js";
import { MAX_EQUIPMENT_KEYS, setCredits } from "../../sim/player/profile.js";
import type { PlayerProfile } from "../../sim/player/profile.js";
import { maxRelativeMagnitude } from "../../render/sync.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import { createTestHook, readMemory } from "../probe.js";
import type { WegoliteProbe, WegoliteSaveProbe } from "../probe.js";
import type { RedrawGate } from "../redraw-gate.js";
import type { SceneManager } from "../scene-manager.js";
import type { SessionState } from "./context.js";

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
    );
  }

  /** `?test=1` seam: replace the balance; never persisted by the hook itself. */
  function applyTestCredits(credits: number): boolean {
    return commitProfile(setCredits(ctx.core.profile, credits));
  }

  /** `?test=1` seam: grant only a key the validated catalogue knows. */
  function applyTestEquipment(key: string): boolean {
    const catalogue = ctx.core.equipmentCatalogue;
    if (catalogue === undefined) return false;
    if (catalogue.every((item) => item.key !== key)) return false;
    if (ctx.core.profile.equipment.includes(key)) return false;
    if (ctx.core.profile.equipment.length >= MAX_EQUIPMENT_KEYS) return false;
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
      probe.world = {
        planet: toTuple(currentLayout.planet.position),
        sun: toTuple(currentLayout.sun.position),
        station: toTuple(currentLayout.station.position),
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
        contacts:
          model === undefined
            ? []
            : model.contacts
                .filter((contact) => contact.visible)
                .map((contact) => contact.id),
        compass:
          model === undefined
            ? { target: "planet", forward: false }
            : {
                target: model.compass.target,
                forward: model.compass.forward,
              },
        aegis: model === undefined ? "none" : model.aegis,
        message: model === undefined ? "" : model.message,
        fuelText: model === undefined ? "" : model.fuelText,
        fuel: model === undefined ? 0 : model.bars.fuel,
        hyperspaceTarget: model === undefined ? "" : model.hyperspaceTarget,
        bounds: currentHud.bounds,
      };
    }

    probe.hints =
      ctx.runtime.hints === undefined ? [] : [...ctx.runtime.hints.seen];
  }

  function withdrawProbe(): void {
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
