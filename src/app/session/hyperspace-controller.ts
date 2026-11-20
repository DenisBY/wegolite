// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hyperspace controller (Phase 8, D-12 step 7, ARCHITECTURE.md section 4.2).
 *
 * The arrival swap and the helpers it needs: resolving the committed target,
 * entering a system scene, the app-owned refusal copy and the status overlay.
 * The bodies are the ones `createGameSession` carried before the split, reading
 * live fields through `ctx` at every call (G-8).
 *
 * The arrival is one atomic unit (G-7). Everything that can throw runs before
 * any live reference moves; a failed destination build freezes the session and
 * leaves the profile, the market, the market seed and the committed target
 * untouched; the install block that follows cannot throw; the arrival autosave
 * runs last.
 *
 * Node-safe: the failure surface, the autosave, the economy probe and the
 * scene manager reach the controller through `deps`, and the one DOM read
 * (`syncStatusOverlay`) is guarded, so a unit test passes recording doubles.
 */

import type { System } from "../../content/types.js";
import { MESSAGE_DURATION_SECONDS } from "../../render/hud/messages.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import {
  arrivalMarketSeed,
  generateMarket,
  marketSeedForSystem,
} from "../../sim/economy/market.js";
import type { Market } from "../../sim/economy/market.js";
import type { HyperspaceRefusal, WitchspaceBlocker } from "../../sim/events.js";
import { poseOf } from "../../sim/flight/state.js";
import {
  applyWitchpointArrival,
  drawWitchpointExit,
} from "../../sim/hyperspace/arrival.js";
import { deriveSystemLayout } from "../../sim/world/layout.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import type { SceneManager } from "../scene-manager.js";
import type { SessionFaults } from "../game-session.js";
import type { SessionState } from "./context.js";

/** The message the injected destination-build fault throws (WR-04). */
export const DESTINATION_BUILD_FAULT_MESSAGE =
  "Injected destination-build failure (test seam)";

/** What the controller calls outside the session context. */
export interface HyperspaceControllerDeps {
  /** The one scene manager; only `enterSystem` and `layout` are used. */
  readonly scenes: Pick<SceneManager, "enterSystem" | "layout">;
  /** The validated galaxy; every destination id resolves through it (T-06-12). */
  readonly galaxyById: ReadonlyMap<string, System>;
  readonly messages: Pick<MessageQueue, "enqueue" | "clearPrevious">;
  /** D-18: test-only failure injection. */
  readonly faults: SessionFaults | undefined;
  /** The single boot-failure surface. */
  readonly showBootFailure: (reason: string) => void;
  /** The probe's failure publication. */
  readonly publishFailure: (reason: string) => void;
  /** The arrival anchor write. */
  readonly autosave: () => void;
  /** Publish the live economy on the probe. */
  readonly syncEconomyProbe: () => void;
  /**
   * Close the galactic chart, restoring its saved input context. An arrival
   * that completes behind an open chart closes it (WORLD-11).
   */
  readonly closeChart: () => void;
}

export function createHyperspaceController(
  ctx: SessionState,
  deps: HyperspaceControllerDeps,
) {
  const {
    scenes,
    galaxyById,
    messages,
    faults,
    showBootFailure,
    publishFailure,
    autosave,
    syncEconomyProbe,
    closeChart,
  } = deps;

  /** D-09: resolve and install a new system scene; never rebuild the dock port. */
  function enterSystemById(id: string): SystemLayout {
    const currentStationDef = ctx.core.stationDef;
    if (currentStationDef === undefined) {
      throw new Error(
        "Wegolite: cannot enter a system before the station loads.",
      );
    }
    const next = galaxyById.get(id);
    if (next === undefined) {
      throw new Error(`Wegolite: no system with id "${id}" in this galaxy.`);
    }
    // Derive the destination layout before the scene manager switches. The
    // scene manager derives the same layout from the same two arguments, so
    // the two copies have equal content. A throw here leaves the scene
    // manager, the scene and the session all on the origin.
    const nextLayout = deriveSystemLayout(next, currentStationDef);
    const nextScene = scenes.enterSystem(next, currentStationDef);
    // Commit point: the scene manager has installed the destination. Nothing
    // below can throw, so the session takes the system, scene and layout in
    // the same step as the switch. The `??` fallback mirrors `performSwap`.
    const assignedLayout = scenes.layout() ?? nextLayout;
    ctx.core.system = next;
    ctx.core.scene = nextScene;
    ctx.core.layout = assignedLayout;
    // The new dust field has no camera history; a stale delta would smear it.
    ctx.core.previousCameraWorld = undefined;
    return assignedLayout;
  }

  /** The committed target record, resolved through the validated catalogue. */
  function targetSystem(): System | undefined {
    if (ctx.core.hyperspaceTargetId === undefined) return undefined;
    return galaxyById.get(ctx.core.hyperspaceTargetId);
  }

  /** D-06 copy is app-owned; the sim event carries a payload-free reason. */
  function refusalCopy(
    reason: HyperspaceRefusal,
    blocker?: WitchspaceBlocker,
  ): string {
    switch (reason) {
      case "no target":
        return "No target selected";
      case "too far":
        return "Destination is too far";
      case "insufficient fuel":
        return "Insufficient fuel";
      case "blocked":
        // The blocker is named as Oolite's witch-blocked message names it
        // (PlayerEntity.m lines 6550-6553): the Coriolis station, the two
        // buoys (Phase 18, D-09) or an NPC ship. Every line fits
        // MAX_MESSAGE_CHARS (60, owner decisions 2026-11-20): the HUD clamps a
        // longer line with an ellipsis, which would cut the name. The beacon
        // line is 55, the station line 54, the nav buoy line 53, the ship
        // line 44. Oolite's own string, "Witchspace jump aborted (too
        // close to [blockerName])." (descriptions.plist line 503), waits for
        // the HUD word wrap (todo 2026-11-20-hud-message-word-wrap-like-oolite).
        switch (blocker) {
          case "ship":
            return "Witchspace jump aborted: too close to a ship";
          case "navBuoy":
            return "Witchspace jump aborted: too close to Navigation Buoy";
          case "witchpointBeacon":
            return "Witchspace jump aborted: too close to Witchpoint Beacon";
          case "station":
          case undefined:
            return "Witchspace jump aborted: too close to Coriolis Station";
        }
    }
  }

  /**
   * IN-02: the global `#status` overlay names the live system. It is written
   * from session state after the boot install, a jump and a Load, so it never
   * claims a stale system. A Node unit test has no document, so it is a no-op
   * there.
   */
  function syncStatusOverlay(): void {
    if (typeof document === "undefined") return;
    const element = document.getElementById("status");
    if (element === null) return;
    element.textContent = `Wegolite — ${ctx.core.system.name}`;
  }

  /** D-09: the synchronous arrival swap and its one seeded market. */
  function handleHyperspaceJumped(event: {
    destinationId: string;
    clockDeltaSeconds: number;
    fuelCost: number;
  }): void {
    const currentState = ctx.core.state;
    const currentConfig = ctx.core.config;
    const catalogue = ctx.core.commodities;
    if (
      currentState === undefined ||
      currentConfig === undefined ||
      catalogue === undefined
    ) {
      return;
    }
    // T-06-12: the destination is resolved only through the validated galaxy.
    const destination = galaxyById.get(event.destinationId);
    if (destination === undefined) {
      ctx.core.lastRefusal = { reason: "too far" };
      // A refusal clears the last message and lasts 4.5 s, as every refusal
      // of witchJumpChecklist does (PlayerEntity.m:6584-6586).
      messages.clearPrevious();
      messages.enqueue(refusalCopy("too far"), 4.5);
      return;
    }
    const originId = ctx.core.system.id;
    const previousSeed = ctx.core.marketSeed ?? marketSeedForSystem(originId);
    const nextSeed = arrivalMarketSeed(destination.id, previousSeed);
    // The arrival offset is drawn once, here at the jump commit, from the
    // origin's persisted market seed. A reload restores the saved pose and
    // never calls this draw, so a reload cannot re-roll the arrival. The draw
    // is pure and cannot throw, so it stays outside the try block.
    const exit = drawWitchpointExit(previousSeed);
    const nextFuel = Math.max(0, ctx.core.profile.fuel - event.fuelCost);

    // G-7: the sim has already committed the jump (clock advanced, countdown
    // cleared), so everything that can throw runs here, before any live
    // reference moves: the destination market, then the destination scene.
    // enterSystemById derives the destination layout before the scene manager
    // switches, and the scene manager installs the destination before it
    // retires the origin (T-06-13). A throw before the switch leaves the origin
    // scene, the scene manager and the system/scene/layout triple untouched; a
    // throw after the switch cannot happen inside enterSystemById. A throw
    // shows the failure surface and leaves profile, market, seed and target
    // untouched.
    let nextMarket: Market;
    let arrivedLayout: SystemLayout;
    try {
      nextMarket = generateMarket(destination, catalogue, nextSeed);
      // D-18 / WR-04: the injected fault sits between the destination market
      // build and the scene switch, so it exercises the same failure surface.
      if (faults?.failDestinationBuild === true) {
        throw new Error(DESTINATION_BUILD_FAULT_MESSAGE);
      }
      arrivedLayout = enterSystemById(destination.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      showBootFailure(
        "Hyperspace arrival failed. Reload the page to restart Wegolite.",
      );
      publishFailure(detail);
      // Freeze the sim behind the failure surface: no further steps, no
      // autosave from the advancing clock.
      ctx.runtime.paused = true;
      return;
    }

    // One synchronous install block: plain assignments and the pure arrival
    // pose. Nothing in it throws, so the session is never half-applied.
    ctx.core.profile = { ...ctx.core.profile, fuel: nextFuel };
    ctx.core.market = nextMarket;
    ctx.core.marketSeed = nextSeed;
    // The committed `hyperspaceTargetId` is deliberately retained: the arrival
    // snapshot carries it (PROJECT.md:126-127, Oolite's unchanged
    // target_system_id), and the HUD/F5 target line keeps naming it.
    applyWitchpointArrival(currentState, arrivedLayout, currentConfig, exit);
    // D-02: the arrival bumps the epoch and derives the new world from the
    // destination's market seed, here and not later, so the arrival autosave
    // below follows the new world. It cannot throw: `nextSeed` is finite and
    // the inert populator is total (rule ii of the world lifecycle).
    ctx.core.worldLifecycle?.begin(nextSeed);
    const arrivedPose = poseOf(currentState);
    ctx.core.previousPose = arrivedPose;
    ctx.core.currentPose = arrivedPose;
    ctx.station.stationScreen = "home";
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    ctx.station.stationMessage = "";
    ctx.station.stationPage = 1;
    ctx.chart.chartSelectedId = undefined;
    ctx.core.lastJump = {
      destinationId: destination.id,
      clockDeltaSeconds: event.clockDeltaSeconds,
      fuelCost: event.fuelCost,
    };
    // An arrival behind the chart (WORLD-11): the simulation keeps running
    // behind an open chart, so the jump can complete under it. Close it here,
    // after the install and before the announcement, so the destination never
    // appears under an open chart and the input context returns to the one the
    // chart saved (flight). The failure branch above returns before this, so a
    // failed arrival leaves the chart as it was.
    if (ctx.chart.chartOpen) closeChart();
    syncStatusOverlay();
    messages.enqueue(
      `Arrived at ${destination.name}`,
      MESSAGE_DURATION_SECONDS,
    );
    // The arrival anchor is a complete in-flight v2 snapshot.
    autosave();
    syncEconomyProbe();
  }

  return {
    refusalCopy,
    handleHyperspaceJumped,
    enterSystemById,
    targetSystem,
    syncStatusOverlay,
  };
}

export type HyperspaceController = ReturnType<
  typeof createHyperspaceController
>;
