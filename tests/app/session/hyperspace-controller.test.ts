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

import type { System } from "../../../src/content/types.js";
import { createHyperspaceController } from "../../../src/app/session/hyperspace-controller.js";
import type { HyperspaceControllerDeps } from "../../../src/app/session/hyperspace-controller.js";
import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
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
}

function harness(
  options: { readonly failDestinationBuild?: boolean } = {},
): Harness {
  const ctx = createSessionState({
    system: lave.system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const calls: string[] = [];
  const failures: string[] = [];
  const published: string[] = [];
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
      enqueue: (text) => calls.push(`enqueue ${text}`),
      enqueuePriority: (text) => calls.push(`enqueuePriority ${text}`),
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
  };
  return {
    ctx,
    controller: createHyperspaceController(ctx, deps),
    calls,
    failures,
    published,
  };
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
    expect(calls).toEqual(["enqueuePriority Destination is too far"]);
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
      `enqueue Arrived at ${destination?.name ?? ""}`,
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
