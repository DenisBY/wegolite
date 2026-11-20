// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hyperspace controller against a fake session context (Phase 8, D-12
 * step 7, G-7).
 *
 * Node only, no DOM: a real `SessionState` with an in-flight Lave state and
 * recording doubles for the scene manager, the failure surface, the autosave
 * and the economy probe. The arrival's safety property is the one under test: a
 * failed destination build freezes the session and leaves the profile, the
 * market, the market seed and the committed target exactly as they were.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { NpcShip, System } from "../../../src/content/types.js";
import {
  createInertPopulate,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import { createWorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import type { WorldLifecycle } from "../../../src/app/session/world-lifecycle.js";
import { createHyperspaceController } from "../../../src/app/session/hyperspace-controller.js";
import type { HyperspaceControllerDeps } from "../../../src/app/session/hyperspace-controller.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import type { InputContext } from "../../../src/input/actions.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import { ZERO_INTENT } from "../../../src/sim/flight/controller.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import { MAX_SAVE_EPOCH } from "../../../src/persistence/save.js";
import { MAX_MESSAGE_CHARS } from "../../../src/render/hud/format.js";
import { stepSim } from "../../../src/sim/sim.js";
import { DT } from "../../../src/sim/time.js";
import { npcContacts } from "../../../src/sim/world/contacts.js";
import { createShipField } from "../../../src/sim/world/ship-field.js";
import { liveEntityCount, spawnEntity } from "../../../src/sim/world/world.js";
import { deriveSystemLayout } from "../../../src/sim/world/layout.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";

const lave = laveFixture();
const catalogue = commoditiesFixture();

const galaxy = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];
const destination = galaxy.find((entry) => entry.id !== lave.system.id);
if (destination === undefined) throw new Error("the galaxy has one system");

interface Harness {
  readonly ctx: SessionState;
  readonly controller: ReturnType<typeof createHyperspaceController>;
  readonly calls: string[];
  readonly failures: string[];
  readonly published: string[];
  /** Every input context the chart's close restored, in order. */
  readonly contexts: InputContext[];
  /** The real lifecycle, present when the harness was given a `lifecycleEpoch`. */
  readonly lifecycle: WorldLifecycle | undefined;
}

function harness(
  options: {
    readonly failDestinationBuild?: boolean;
    /** Wire a real lifecycle, traffic on, resumed at this epoch (FOUND-17). */
    readonly lifecycleEpoch?: number;
  } = {},
): Harness {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const calls: string[] = [];
  const failures: string[] = [];
  const published: string[] = [];
  const contexts: InputContext[] = [];
  const state = initFlightState(lave.layout);
  state.mode = "inFlight";
  ctx.core.state = state;
  ctx.core.layout = lave.layout;
  ctx.core.config = lave.config;
  ctx.core.stationDef = lave.stationDef;
  ctx.core.commodities = catalogue;
  ctx.core.marketSeed = marketSeedForSystem(lave.system.id);
  ctx.core.market = generateMarket(lave.system, catalogue, ctx.core.marketSeed);
  ctx.core.hyperspaceTargetId = destination?.id;

  let lifecycle: WorldLifecycle | undefined;
  if (options.lifecycleEpoch !== undefined) {
    ctx.core.npcTraffic = committedTraffic();
    lifecycle = createWorldLifecycle({
      traffic: true,
      populate: createInertPopulate(
        () => ctx.core.npcTraffic,
        () => ctx.core.layout,
      ),
    });
    lifecycle.resetForRestore(options.lifecycleEpoch);
    lifecycle.resume(ctx.core.marketSeed);
    ctx.core.worldLifecycle = lifecycle;
  }

  const galaxyById = new Map(galaxy.map((entry) => [entry.id, entry]));
  const deps: HyperspaceControllerDeps = {
    scenes: {
      enterSystem: (system, stationDef) => {
        calls.push(`enterSystem ${system.id}`);
        void stationDef;
        return {} as ReturnType<
          HyperspaceControllerDeps["scenes"]["enterSystem"]
        >;
      },
      layout: () =>
        deriveSystemLayout(destination ?? lave.system, lave.stationDef),
    },
    galaxyById,
    messages: {
      // Logged with the duration (quick task 261117-pij: per-message
      // durations, Oolite's message rows).
      enqueue: (text, seconds) =>
        calls.push(`enqueue ${text} for ${String(seconds)}`),
      clearPrevious: () => calls.push("clearPrevious"),
    },
    faults:
      options.failDestinationBuild === true
        ? { failDestinationBuild: true }
        : undefined,
    showBootFailure: (reason) => {
      failures.push(reason);
      calls.push("showBootFailure");
    },
    publishFailure: (reason) => {
      published.push(reason);
      calls.push("publishFailure");
    },
    autosave: () => calls.push("autosave"),
    syncEconomyProbe: () => calls.push("syncEconomyProbe"),
    closeChart: () => {
      // The chart controller's close: clear the flag, restore the saved context.
      calls.push("closeChart");
      ctx.chart.chartOpen = false;
      ctx.runtime.input?.setContext(ctx.chart.contextBeforeChart);
    },
  };
  ctx.runtime.input = {
    getContext: () => contexts.at(-1) ?? "flight",
    setContext: (next: InputContext) => {
      contexts.push(next);
    },
  } as unknown as KeyboardInputSource;
  return {
    ctx,
    controller: createHyperspaceController(ctx, deps),
    calls,
    failures,
    published,
    contexts,
    lifecycle,
  };
}

/** The committed NPC catalogue as the session loads it (traffic on). */
function committedTraffic(): ReturnType<typeof trafficContent> {
  return trafficContent(
    JSON.parse(
      readFileSync("src/content/generated/ships-npc.json", "utf8"),
    ) as NpcShip[],
  );
}

const jumped = {
  destinationId: destination?.id ?? "",
  clockDeltaSeconds: 576,
  fuelCost: 10,
};

describe("handleHyperspaceJumped, a failed destination build (G-7)", () => {
  it("freezes the session, shows one failure, and leaves the economy and target untouched", () => {
    const { ctx, controller, calls, failures, published } = harness({
      failDestinationBuild: true,
    });
    const profile = ctx.core.profile;
    const market = ctx.core.market;
    const marketSeed = ctx.core.marketSeed;
    const targetId = ctx.core.hyperspaceTargetId;
    const system = ctx.core.system;
    const layout = ctx.core.layout;
    const profileSnapshot = structuredClone(profile);

    controller.handleHyperspaceJumped(jumped);

    expect(ctx.runtime.paused).toBe(true);
    expect(failures).toEqual([
      "Hyperspace arrival failed. Reload the page to restart Wegolite.",
    ]);
    expect(published).toEqual([
      "Injected destination-build failure (test seam)",
    ]);
    expect(calls).toEqual(["showBootFailure", "publishFailure"]);
    expect(calls).not.toContain("autosave");
    expect(ctx.core.profile).toBe(profile);
    expect(ctx.core.profile).toEqual(profileSnapshot);
    expect(ctx.core.market).toBe(market);
    expect(ctx.core.marketSeed).toBe(marketSeed);
    expect(ctx.core.hyperspaceTargetId).toBe(targetId);
    expect(ctx.core.system).toBe(system);
    expect(ctx.core.layout).toBe(layout);
    expect(ctx.core.lastJump).toBeNull();
  });
});

describe("handleHyperspaceJumped, an unknown destination", () => {
  it("records a too-far refusal and changes nothing else", () => {
    const { ctx, controller, calls } = harness();
    const profile = ctx.core.profile;
    const market = ctx.core.market;
    const marketSeed = ctx.core.marketSeed;
    const targetId = ctx.core.hyperspaceTargetId;

    controller.handleHyperspaceJumped({
      destinationId: "no-such-system",
      clockDeltaSeconds: 0,
      fuelCost: 0,
    });

    expect(ctx.core.lastRefusal).toEqual({ reason: "too far" });
    // witchJumpChecklist clears the last message and posts for 4.5 s
    // (PlayerEntity.m:6584-6586).
    expect(calls).toEqual([
      "clearPrevious",
      "enqueue Destination is too far for 4.5",
    ]);
    expect(ctx.runtime.paused).toBe(false);
    expect(ctx.core.profile).toBe(profile);
    expect(ctx.core.market).toBe(market);
    expect(ctx.core.marketSeed).toBe(marketSeed);
    expect(ctx.core.hyperspaceTargetId).toBe(targetId);
    expect(ctx.core.lastJump).toBeNull();
  });
});

describe("handleHyperspaceJumped, a committed arrival", () => {
  it("installs the destination, then announces, autosaves last and publishes the economy", () => {
    const { ctx, controller, calls } = harness();
    const previousSeed = ctx.core.marketSeed ?? 0;
    const fuelBefore = ctx.core.profile.fuel;

    controller.handleHyperspaceJumped(jumped);

    expect(calls).toEqual([
      `enterSystem ${destination?.id ?? ""}`,
      `enqueue Arrived at ${destination?.name ?? ""} for 4`,
      "autosave",
      "syncEconomyProbe",
    ]);
    expect(ctx.core.system).toBe(destination);
    expect(ctx.core.marketSeed).not.toBe(previousSeed);
    expect(ctx.core.market?.seed).toBe(ctx.core.marketSeed);
    expect(ctx.core.profile.fuel).toBe(Math.max(0, fuelBefore - 10));
    expect(ctx.core.hyperspaceTargetId).toBe(destination?.id);
    expect(ctx.core.lastJump).toEqual(jumped);
    expect(ctx.station.stationScreen).toBe("home");
    expect(ctx.runtime.paused).toBe(false);
  });
});

describe("handleHyperspaceJumped behind an open chart (WORLD-11)", () => {
  it("closes the chart in the post-install steps and leaves the flight context", () => {
    const { ctx, controller, calls, contexts } = harness();
    ctx.chart.chartOpen = true;
    ctx.chart.contextBeforeChart = "flight";
    ctx.chart.chartSelectedId = destination?.id;

    controller.handleHyperspaceJumped(jumped);

    expect(ctx.chart.chartOpen).toBe(false);
    expect(ctx.chart.chartSelectedId).toBeUndefined();
    expect(contexts).toEqual(["flight"]);
    // After the scene install, before the announcement and the arrival anchor.
    expect(calls).toEqual([
      `enterSystem ${destination?.id ?? ""}`,
      "closeChart",
      `enqueue Arrived at ${destination?.name ?? ""} for 4`,
      "autosave",
      "syncEconomyProbe",
    ]);
  });

  it("never closes a chart that is already closed", () => {
    const { ctx, controller, calls, contexts } = harness();
    expect(ctx.chart.chartOpen).toBe(false);
    controller.handleHyperspaceJumped(jumped);
    expect(calls).not.toContain("closeChart");
    expect(contexts).toEqual([]);
  });

  it("a failed arrival leaves the chart and the input context as they were", () => {
    const { ctx, controller, calls, contexts } = harness({
      failDestinationBuild: true,
    });
    ctx.chart.chartOpen = true;
    ctx.chart.contextBeforeChart = "flight";
    ctx.chart.chartSelectedId = destination?.id;

    controller.handleHyperspaceJumped(jumped);

    expect(ctx.chart.chartOpen).toBe(true);
    expect(ctx.chart.chartSelectedId).toBe(destination?.id);
    expect(contexts).toEqual([]);
    expect(calls).toEqual(["showBootFailure", "publishFailure"]);
  });
});

describe("handleHyperspaceJumped, a refused world begin (FOUND-17, WR-01)", () => {
  /** A flight state far from every body, with the origin world's ship beside it. */
  function farFlight(): ReturnType<typeof initFlightState> {
    const state = initFlightState(lave.layout);
    state.mode = "inFlight";
    state.dockArmed = false;
    state.position = vec(
      lave.layout.station.position.x + 600_000,
      lave.layout.station.position.y,
      lave.layout.station.position.z,
    );
    return state;
  }

  it("ends the origin world at the maximum live epoch: no ship is drawn, listed, mass-locking or blocking, and the anchor is cleared", () => {
    const MAX_LIVE = MAX_SAVE_EPOCH;
    const { ctx, controller, lifecycle } = harness({
      lifecycleEpoch: MAX_LIVE,
    });
    if (lifecycle === undefined) throw new Error("expected a lifecycle");
    const origin = lifecycle.world;
    if (origin === undefined) throw new Error("expected the origin world");
    // The origin world is populated: the inert twelve plus a ship next to the
    // far player pose, so the checks below are not vacuous.
    expect(liveEntityCount(origin)).toBe(12);
    const spawned = spawnEntity(
      origin,
      {
        kind: "ship",
        specKey: "viper",
        scanClass: "CLASS_NEUTRAL",
        position: vec(
          lave.layout.station.position.x + 601_000,
          lave.layout.station.position.y,
          lave.layout.station.position.z,
        ),
        orientation: identity(),
        radius: 50,
      },
      0,
    );
    expect(spawned.ok).toBe(true);
    expect(lifecycle.anchorNextEntityId).toBe(113);
    expect(npcContacts(origin)).toHaveLength(13);
    const masses = ctx.core.npcTraffic?.masses;
    const step = (world: typeof origin | undefined): boolean => {
      const state = farFlight();
      stepSim(state, world, lave.layout, lave.config, ZERO_INTENT, [], DT);
      return state.torus.massLocked;
    };
    // With the origin world live a ship beside the player mass-locks the torus;
    // without any world the same pose is clean.
    expect(step(origin)).toBe(true);
    expect(step(undefined)).toBe(false);
    expect(
      createShipField(origin, masses).massLocked(
        farFlight().position,
        lave.layout.scannerRange,
      ),
    ).toBe(true);

    controller.handleHyperspaceJumped(jumped);

    expect(lifecycle.epoch).toBe(MAX_LIVE);
    expect(lifecycle.world).toBeUndefined();
    expect(lifecycle.anchorNextEntityId).toBeUndefined();
    // Nothing is drawn or on the scanner.
    expect(npcContacts(lifecycle.world)).toEqual([]);
    // The step the session now takes builds no ship field: no mass lock.
    expect(step(lifecycle.world)).toBe(false);
  });

  it("keeps the origin world when the arrival build fails before the begin", () => {
    const { controller, lifecycle } = harness({
      failDestinationBuild: true,
      lifecycleEpoch: 1,
    });
    if (lifecycle === undefined) throw new Error("expected a lifecycle");
    const origin = lifecycle.world;
    expect(origin).toBeDefined();
    controller.handleHyperspaceJumped(jumped);
    expect(lifecycle.world).toBe(origin);
    expect(lifecycle.epoch).toBe(1);
    expect(lifecycle.anchorNextEntityId).toBe(113);
  });
});

describe("refusalCopy and targetSystem", () => {
  it("names each refusal with the fixed app copy", () => {
    const { controller } = harness();
    expect(controller.refusalCopy("no target")).toBe("No target selected");
    expect(controller.refusalCopy("too far")).toBe("Destination is too far");
    expect(controller.refusalCopy("insufficient fuel")).toBe(
      "Insufficient fuel",
    );
    expect(controller.refusalCopy("blocked")).toBe(
      "Witchspace jump aborted: too close to Coriolis Station",
    );
  });

  it("names a ship blocker with its own copy and keeps the station copy otherwise", () => {
    const { controller } = harness();
    const shipCopy = controller.refusalCopy("blocked", "ship");
    expect(shipCopy).toBe("Witchspace jump aborted: too close to a ship");
    expect(shipCopy).toHaveLength(44);
    expect(controller.refusalCopy("blocked", "station")).toBe(
      "Witchspace jump aborted: too close to Coriolis Station",
    );
    // A blocker never changes the other reasons.
    expect(controller.refusalCopy("too far", "ship")).toBe(
      "Destination is too far",
    );
  });

  it("names each buoy blocker by its Oolite name within the HUD message line (D-09)", () => {
    const { controller } = harness();
    // Oolite's witch-blocked string names the blocker (`[blocker name]`,
    // PlayerEntity.m lines 6552-6553); the names are shipdata.plist's. The
    // beacon line is 55 characters, the HUD line's budget since the owner
    // decision of 2026-11-20, so the HUD never cuts the name.
    const nav = controller.refusalCopy("blocked", "navBuoy");
    const beacon = controller.refusalCopy("blocked", "witchpointBeacon");
    expect(nav).toBe("Witchspace jump aborted: too close to Navigation Buoy");
    expect(beacon).toBe(
      "Witchspace jump aborted: too close to Witchpoint Beacon",
    );
    expect(beacon).toHaveLength(55);
    expect(nav.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    expect(beacon.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    expect(controller.refusalCopy("insufficient fuel", "navBuoy")).toBe(
      "Insufficient fuel",
    );
  });

  it("resolves the committed target only through the catalogue", () => {
    const { ctx, controller } = harness();
    expect(controller.targetSystem()).toBe(destination);
    ctx.core.hyperspaceTargetId = "no-such-system";
    expect(controller.targetSystem()).toBeUndefined();
    ctx.core.hyperspaceTargetId = undefined;
    expect(controller.targetSystem()).toBeUndefined();
  });

  it("writes no status overlay without a document", () => {
    const { controller } = harness();
    expect(typeof document).toBe("undefined");
    expect(() => {
      controller.syncStatusOverlay();
    }).not.toThrow();
  });
});
