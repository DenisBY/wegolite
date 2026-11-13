// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station controller against a fake session context (Phase 8, D-12 step 5,
 * G-8).
 *
 * Node only, no DOM: a real `SessionState`, a real Lave market generated from
 * the committed commodity catalogue, and recording doubles for the station
 * shell and every dependency function. The trade rules under test are the
 * controller's: a refused plan never replaces the profile object, and an
 * accepted buy changes the balance by exactly the plan's cost.
 */

import { describe, expect, it } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createStationController } from "../../../src/app/session/station-controller.js";
import type { StationController } from "../../../src/app/session/station-controller.js";
import type { Command } from "../../../src/sim/commands.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../../src/sim/economy/market.js";
import type { Market } from "../../../src/sim/economy/market.js";
import type { TradePlan } from "../../../src/sim/economy/trade.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { newProfile } from "../../../src/sim/player/profile.js";
import type { PlayerProfile } from "../../../src/sim/player/profile.js";
import type { StationView } from "../../../src/ui/station.js";
import {
  commoditiesFixture,
  commodityUnits,
} from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout } = laveFixture();
const catalogue = commoditiesFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly controller: StationController;
  readonly calls: string[];
  readonly views: StationView[];
  readonly profiles: PlayerProfile[];
  readonly pending: Command[];
  readonly market: Market;
}

function harness(): Harness {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const calls: string[] = [];
  const views: StationView[] = [];
  const profiles: PlayerProfile[] = [];
  const pending: Command[] = [];
  const market = generateMarket(
    system,
    catalogue,
    marketSeedForSystem("g0-s7"),
  );
  ctx.core.state = initFlightState(layout);
  ctx.core.commodities = catalogue;
  ctx.core.commodityUnits = commodityUnits(catalogue);
  ctx.core.market = market;
  ctx.core.marketSeed = market.seed;
  ctx.station.stationScreen = "market";
  const controller = createStationController(ctx, {
    docked: {
      setFuel: () => calls.push("setFuel"),
      render: (view: StationView) => {
        calls.push("render");
        views.push(view);
      },
    },
    pending,
    onProfileChanged: (profile) => profiles.push(profile),
    targetSystem: () => undefined,
    canOverwrite: () => true,
    syncEconomyProbe: () => calls.push("syncEconomyProbe"),
    autosave: () => calls.push("autosave"),
    openChart: () => calls.push("openChart"),
    closeChart: () => calls.push("closeChart"),
    openSaveScreen: () => calls.push("openSaveScreen"),
    closeSaveScreen: () => calls.push("closeSaveScreen"),
  });
  return { ctx, controller, calls, views, profiles, pending, market };
}

/** The first commodity a player can actually trade here, read from the fixtures. */
function firstTradeable(market: Market) {
  const good = market.goods.find((entry) => {
    const commodity = catalogue.find((record) => record.key === entry.key);
    return commodity?.tradeable === true && entry.stock > 0;
  });
  if (good === undefined) throw new Error("the Lave market has no good to buy");
  return good;
}

function asTrade(value: unknown): TradePlan {
  const plan = value as TradePlan;
  expect(plan).toHaveProperty("side");
  return plan;
}

describe("selection", () => {
  it("selects the first tradeable good with stock and moves with wrap-around", () => {
    const { ctx, controller, market } = harness();
    controller.ensureSelection();
    const first = firstTradeable(market);
    expect(ctx.station.stationSelection).toBe(first.key);

    const keys = controller.selectableKeys();
    expect(keys[0]).toBe(first.key);
    controller.moveSelection(-1);
    expect(ctx.station.stationSelection).toBe(keys[keys.length - 1]);
    controller.moveSelection(1);
    expect(ctx.station.stationSelection).toBe(first.key);
  });
});

describe("a refused trade", () => {
  it("leaves the profile the same object when the plan is refused", () => {
    const { ctx, controller, calls, profiles } = harness();
    ctx.core.profile = { ...newProfile(), credits: 0 };
    const before = ctx.core.profile;
    controller.ensureSelection();

    controller.stepAmount(1);

    expect(ctx.core.profile).toBe(before);
    expect(ctx.station.stationPending).toBeNull();
    expect(ctx.station.stationNotice).toBe("Not enough credits");
    expect(profiles).toEqual([]);
    expect(calls).not.toContain("autosave");
  });

  it("leaves the profile the same object when a pending plan went stale", () => {
    const { ctx, controller, calls, profiles, market } = harness();
    controller.ensureSelection();
    controller.stepAmount(1);
    expect(ctx.station.stationPending).not.toBeNull();

    // The balance drops after the plan was made: applyBuy re-plans and refuses.
    ctx.core.profile = { ...ctx.core.profile, credits: 0 };
    const before = ctx.core.profile;
    controller.confirmTrade();

    expect(ctx.core.profile).toBe(before);
    expect(ctx.core.market).toBe(market);
    expect(ctx.station.stationPending).toBeNull();
    expect(ctx.station.stationNotice).toBe("That trade is no longer available");
    expect(ctx.station.lastTrade).toBeNull();
    expect(profiles).toEqual([]);
    expect(calls).not.toContain("autosave");
  });
});

describe("an accepted buy", () => {
  it("lowers credits by exactly the plan's cost and raises the hold by one unit", () => {
    const { ctx, controller, calls, profiles, market } = harness();
    controller.ensureSelection();
    const good = firstTradeable(market);
    const creditsBefore = ctx.core.profile.credits;
    const profileBefore = ctx.core.profile;

    controller.stepAmount(1);
    const plan = asTrade(ctx.station.stationPending);
    // The plan's cost for one unit is the shelf price the market was built with.
    expect(plan.ok).toBe(true);
    expect(plan.side).toBe("buy");
    expect(plan.key).toBe(good.key);
    expect(plan.amount).toBe(1);
    expect(plan.cost).toBe(good.price);

    controller.confirmTrade();

    expect(ctx.core.profile).not.toBe(profileBefore);
    expect(ctx.core.profile.credits).toBe(creditsBefore - good.price);
    expect(ctx.core.profile.cargo[good.key]).toBe(1);
    expect(profiles).toEqual([ctx.core.profile]);
    const after = ctx.core.market?.goods.find(
      (entry) => entry.key === good.key,
    );
    expect(after?.stock).toBe(good.stock - 1);
    expect(ctx.station.lastTrade).toEqual({
      kind: "buy",
      key: good.key,
      amount: 1,
    });
    expect(ctx.station.stationPending).toBeNull();
    // The purchase anchors one autosave, after the profile commit's render.
    expect(calls.filter((call) => call === "autosave")).toEqual(["autosave"]);
    expect(calls.lastIndexOf("render")).toBeLessThan(calls.indexOf("autosave"));
  });
});

describe("cancelTrade", () => {
  it("clears the pending plan and the notice and renders the station", () => {
    const { ctx, controller, calls, views } = harness();
    controller.ensureSelection();
    controller.stepAmount(1);
    expect(ctx.station.stationPending).not.toBeNull();
    ctx.station.stationNotice = "stale";
    calls.length = 0;
    views.length = 0;

    controller.cancelTrade();

    expect(ctx.station.stationPending).toBeNull();
    expect(ctx.station.stationNotice).toBe("");
    expect(views).toHaveLength(1);
    expect(views[0]?.screen).toBe("market");
  });
});

describe("Node safety and guards", () => {
  it("syncHeaderCredits is a no-op without a document", () => {
    const { controller } = harness();
    expect(typeof document).toBe("undefined");
    expect(() => {
      controller.syncHeaderCredits();
    }).not.toThrow();
  });

  it("renderStation draws the shell and publishes the economy probe", () => {
    const { controller, calls, views, ctx } = harness();
    controller.renderStation();
    expect(calls).toEqual(["setFuel", "render", "syncEconomyProbe"]);
    expect(views[0]?.creditsText).toBe("100.0 Cr");
    expect(views[0]?.systemName).toBe(ctx.core.system.name);
  });

  it("applyStationAction does nothing while the session is not docked", () => {
    const { ctx, controller, calls } = harness();
    const state = initFlightState(layout);
    state.mode = "inFlight";
    ctx.core.state = state;
    controller.applyStationAction("stationConfirm");
    expect(calls).toEqual([]);
    expect(ctx.station.stationNotice).toBe("");
  });

  it("navigateStation is inert while paused", () => {
    const { ctx, controller, calls, pending } = harness();
    ctx.runtime.paused = true;
    controller.navigateStation("launch");
    expect(calls).toEqual([]);
    expect(pending).toEqual([]);
  });

  it("setStationPage moves the Status page only on the docked status screen", () => {
    const { ctx, controller, views } = harness();
    // On the market screen the page request is ignored.
    controller.setStationPage(2);
    expect(ctx.station.stationPage).toBe(1);
    expect(views).toEqual([]);

    ctx.station.stationScreen = "status";
    controller.setStationPage(2);
    expect(ctx.station.stationPage).toBe(2);
    expect(views).toHaveLength(1);
    expect(views[0]?.screen).toBe("status");
  });
});
