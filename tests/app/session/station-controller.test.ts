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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createStationController } from "../../../src/app/session/station-controller.js";
import type { StationController } from "../../../src/app/session/station-controller.js";
import { parseEquipment } from "../../../src/content/equipment.js";
import type { Equipment, System } from "../../../src/content/types.js";
import type { ActionId } from "../../../src/input/actions.js";
import type { InputContext } from "../../../src/input/actions.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import {
  profileFromSave,
  snapshotForSave,
} from "../../../src/persistence/autosave.js";
import {
  SAVE_VERSION,
  encodeSave,
  parseSave,
} from "../../../src/persistence/save.js";
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
import { saveAllowLists } from "../../helpers/save-builders.js";

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
  /** The launch pre-roll the nav state reads (quick 261118-os8). */
  readonly preRoll: { preRolling: boolean };
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
  const preRoll = { preRolling: false };
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
    launchSequence: preRoll,
  });
  return { ctx, controller, calls, views, profiles, pending, market, preRoll };
}

describe("the station nav state in the launch pre-roll (quick 261118-os8)", () => {
  it("reports launching while docked and pre-rolling, and the sim mode otherwise", () => {
    const { ctx, controller, preRoll } = harness();
    const seen: string[] = [];
    ctx.station.stationNav = {
      sync: (state: { readonly mode: string }) => seen.push(state.mode),
    } as unknown as typeof ctx.station.stationNav;
    controller.syncStationNav();
    preRoll.preRolling = true;
    controller.syncStationNav();
    if (ctx.core.state === undefined) throw new Error("no state");
    ctx.core.state.mode = "inFlight";
    controller.syncStationNav();
    expect(seen).toEqual(["docked", "launching", "inFlight"]);
  });
});

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

describe("commitProfile outside the station (Phase 19 review WR-01)", () => {
  it("docked: publishes the profile and rebuilds the station view", () => {
    const { ctx, controller, calls, profiles } = harness();
    expect(ctx.core.state?.mode).toBe("docked");
    const next = { ...ctx.core.profile, credits: 1234 };
    expect(controller.commitProfile(next)).toBe(true);
    expect(ctx.core.profile).toBe(next);
    expect(profiles).toEqual([next]);
    expect(calls).toContain("render");
    expect(calls).toContain("syncEconomyProbe");
  });

  it("in flight and launching: publishes the profile and the probe, never the view", () => {
    for (const mode of ["inFlight", "launching"] as const) {
      const { ctx, controller, calls, profiles } = harness();
      if (ctx.core.state === undefined) throw new Error("no flight state");
      ctx.core.state.mode = mode;
      // Damage-flow commits, one per event inside one step.
      let profile = ctx.core.profile;
      for (const credits of [1, 2, 3]) {
        profile = { ...profile, credits };
        expect(controller.commitProfile(profile)).toBe(true);
      }
      expect(ctx.core.profile).toBe(profile);
      expect(profiles).toHaveLength(3);
      expect(calls).toEqual([
        "syncEconomyProbe",
        "syncEconomyProbe",
        "syncEconomyProbe",
      ]);
    }
  });

  it("a refused commit (the same profile) changes and calls nothing", () => {
    const { ctx, controller, calls, profiles } = harness();
    if (ctx.core.state === undefined) throw new Error("no flight state");
    ctx.core.state.mode = "inFlight";
    expect(controller.commitProfile(ctx.core.profile)).toBe(false);
    expect(profiles).toEqual([]);
    expect(calls).toEqual([]);
  });
});

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
    expect(views[0]?.creditsText).toBe("100.0 ₢");
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

describe("navigateByKey: the docked screen keys from every screen (docked-f-keys)", () => {
  const SECTION_KEYS = [
    ["stationMarket", "market"],
    ["stationOutfitting", "outfitting"],
    ["stationStatus", "status"],
    ["stationInterfaces", "interfaces"],
  ] as const;

  /** A docked session on Home with a recording input context. */
  function navHarness() {
    const h = harness();
    h.ctx.core.equipmentCatalogue = equipmentCatalogue;
    h.ctx.station.stationScreen = "home";
    let context: InputContext = "dockHome";
    h.ctx.runtime.input = {
      getContext: () => context,
      setContext: (next: InputContext) => {
        context = next;
      },
    } as unknown as KeyboardInputSource;
    return { ...h, context: () => context };
  }

  /** The overlay calls only, without the station render bookkeeping. */
  function overlayCalls(calls: readonly string[]): string[] {
    return calls.filter(
      (call) => call.endsWith("Chart") || call.endsWith("SaveScreen"),
    );
  }

  it.each(SECTION_KEYS)(
    "%s leaves the chart and opens its section",
    (action, screen) => {
      const h = navHarness();
      h.ctx.chart.chartOpen = true;
      h.controller.navigateByKey(action);
      expect(overlayCalls(h.calls)).toEqual(["closeChart"]);
      expect(h.calls[0]).toBe("closeChart");
      expect(h.ctx.station.stationScreen).toBe(screen);
      expect(h.context()).toBe("dockScreen");
    },
  );

  it.each(SECTION_KEYS)(
    "%s leaves the Save/Load screen and opens its section",
    (action, screen) => {
      const h = navHarness();
      h.ctx.save.saveScreenOpen = true;
      h.controller.navigateByKey(action);
      expect(overlayCalls(h.calls)).toEqual(["closeSaveScreen"]);
      expect(h.calls[0]).toBe("closeSaveScreen");
      expect(h.ctx.station.stationScreen).toBe(screen);
    },
  );

  it("F2 leaves the chart for the Save/Load screen and is ignored on its own screen", () => {
    const h = navHarness();
    h.ctx.chart.chartOpen = true;
    h.controller.navigateByKey("saveLoad");
    expect(h.calls).toEqual(["closeChart", "openSaveScreen"]);

    const own = navHarness();
    own.ctx.save.saveScreenOpen = true;
    own.controller.navigateByKey("saveLoad");
    expect(own.calls).toEqual([]);
  });

  it("F6 leaves the Save/Load screen for the chart and does nothing on an open chart", () => {
    const h = navHarness();
    h.ctx.save.saveScreenOpen = true;
    h.controller.navigateByKey("chart");
    expect(h.calls).toEqual(["closeSaveScreen", "openChart"]);

    const open = navHarness();
    open.ctx.chart.chartOpen = true;
    open.ctx.chart.chartPreset = "galaxy";
    const camera = { centre: { x: 40, y: 30 }, spanX: 120 };
    open.ctx.chart.chartCamera = camera;
    // Owner decision 2026-11-24 (FIDELITY E-184): F6 on an open chart is a
    // no-op, twice and three times. It never closes the chart (the owner's
    // F4 -> F6 -> F6 report) and never moves its preset or camera.
    open.controller.navigateByKey("chart");
    open.controller.navigateByKey("chart");
    open.controller.navigateByKey("chart");
    expect(open.calls).toEqual([]);
    expect(open.ctx.chart.chartOpen).toBe(true);
    expect(open.ctx.chart.chartPreset).toBe("galaxy");
    expect(open.ctx.chart.chartCamera).toBe(camera);
    expect(open.context()).toBe("dockHome");
  });

  it("F2 and F6 open their overlays from a section screen", () => {
    const h = navHarness();
    h.ctx.station.stationScreen = "market";
    h.controller.navigateByKey("chart");
    h.controller.navigateByKey("saveLoad");
    expect(h.calls).toEqual(["openChart", "openSaveScreen"]);
  });

  it("in flight no key acts on the open chart; nothing opens a station screen", () => {
    const h = navHarness();
    const state = initFlightState(layout);
    state.mode = "inFlight";
    h.ctx.core.state = state;
    h.ctx.chart.chartOpen = true;
    for (const [action] of SECTION_KEYS) h.controller.navigateByKey(action);
    h.controller.navigateByKey("saveLoad");
    expect(h.calls).toEqual([]);
    h.controller.navigateByKey("chart");
    expect(h.calls).toEqual([]);
    expect(h.ctx.chart.chartOpen).toBe(true);
    expect(h.ctx.station.stationScreen).toBe("home");
  });

  it("ignores any other action, so it never closes an overlay for nothing", () => {
    const h = navHarness();
    h.ctx.chart.chartOpen = true;
    h.controller.navigateByKey("stationConfirm");
    h.controller.navigateByKey("launch");
    expect(h.calls).toEqual([]);
  });

  describe("the second F8 press opens Market Info (quick 261124-nbu)", () => {
    it("F8 opens the market, again Market Info, a third time the list with the same selection", () => {
      const h = navHarness();
      h.controller.navigateByKey("stationMarket");
      expect(h.ctx.station.stationScreen).toBe("market");
      expect(h.ctx.station.stationPage).toBe(1);
      const selected = h.ctx.station.stationSelection;
      expect(selected).not.toBe("");

      h.ctx.station.stationNotice = "stale";
      h.calls.length = 0;
      h.controller.navigateByKey("stationMarket");
      expect(h.ctx.station.stationPage).toBe(2);
      expect(h.ctx.station.stationScreen).toBe("market");
      expect(h.ctx.station.stationPending).toBeNull();
      expect(h.ctx.station.stationNotice).toBe("");
      expect(overlayCalls(h.calls)).toEqual([]);
      const info = h.views[h.views.length - 1]?.market;
      expect(info?.page).toBe(2);
      expect(info?.info?.row.key).toBe(selected);

      h.controller.navigateByKey("stationMarket");
      expect(h.ctx.station.stationPage).toBe(1);
      expect(h.ctx.station.stationSelection).toBe(selected);
      expect(h.views[h.views.length - 1]?.market?.page).toBe(1);
    });

    it.each([
      ["chart", "closeChart"],
      ["save", "closeSaveScreen"],
    ] as const)(
      "F8 with the %s open over the market closes it and lands on the list",
      (overlay, call) => {
        const h = navHarness();
        h.controller.navigateByKey("stationMarket");
        if (overlay === "chart") h.ctx.chart.chartOpen = true;
        else h.ctx.save.saveScreenOpen = true;
        h.calls.length = 0;
        h.controller.navigateByKey("stationMarket");
        expect(overlayCalls(h.calls)).toEqual([call]);
        expect(h.ctx.station.stationPage).toBe(1);
        expect(h.views[h.views.length - 1]?.market?.page).toBe(1);
      },
    );

    it("F8 stays on the list when nothing is selectable", () => {
      const h = navHarness();
      h.ctx.core.market = {
        ...h.market,
        goods: h.market.goods.map((good) => ({ ...good, stock: 0 })),
      };
      h.controller.navigateByKey("stationMarket");
      expect(h.ctx.station.stationSelection).toBe("");
      h.controller.navigateByKey("stationMarket");
      expect(h.ctx.station.stationScreen).toBe("market");
      expect(h.ctx.station.stationPage).toBe(1);
      expect(h.views[h.views.length - 1]?.market?.info).toBeNull();
    });

    it("Up and Down on Market Info move the selection and Market Info follows", () => {
      const h = navHarness();
      h.controller.navigateByKey("stationMarket");
      h.controller.navigateByKey("stationMarket");
      const first = h.ctx.station.stationSelection;
      h.controller.applyStationAction("stationDown");
      const second = h.ctx.station.stationSelection;
      expect(second).not.toBe(first);
      expect(h.ctx.station.stationPage).toBe(2);
      expect(h.views[h.views.length - 1]?.market?.info?.row.key).toBe(second);
      h.controller.applyStationAction("stationUp");
      expect(h.ctx.station.stationSelection).toBe(first);
      expect(h.views[h.views.length - 1]?.market?.info?.row.key).toBe(first);
    });

    it("renders the list when the selection left the market while on page 2", () => {
      const h = navHarness();
      h.controller.navigateByKey("stationMarket");
      h.controller.navigateByKey("stationMarket");
      expect(h.ctx.station.stationPage).toBe(2);
      h.ctx.station.stationSelection = "not_a_good";
      h.controller.renderStation();
      expect(h.ctx.station.stationPage).toBe(1);
      expect(h.views[h.views.length - 1]?.market?.page).toBe(1);
    });
  });

  it("opens nothing during the launch pre-roll, while paused or after death", () => {
    for (const setup of [
      (h: ReturnType<typeof navHarness>) => {
        h.preRoll.preRolling = true;
      },
      (h: ReturnType<typeof navHarness>) => {
        h.ctx.runtime.paused = true;
      },
      (h: ReturnType<typeof navHarness>) => {
        h.ctx.runtime.gameOver = true;
      },
    ]) {
      const h = navHarness();
      setup(h);
      for (const [action] of SECTION_KEYS) h.controller.navigateByKey(action);
      h.controller.navigateByKey("saveLoad");
      h.controller.navigateByKey("chart");
      expect(h.calls).toEqual([]);
      expect(h.ctx.station.stationScreen).toBe("home");
    }
  });
});

describe("sortMarket (quick task 261118-cyo)", () => {
  function sortedKeys(h: Harness, column: "price" | "name"): string[] {
    const goods = [...h.market.goods];
    const value = (key: string): number | string => {
      if (column === "name") {
        return catalogue.find((entry) => entry.key === key)?.name ?? key;
      }
      return goods.find((entry) => entry.key === key)?.price ?? 0;
    };
    return goods
      .map((good, index) => ({ key: good.key, index }))
      .sort((left, right) => {
        const a = value(left.key);
        const b = value(right.key);
        if (a < b) return -1;
        if (a > b) return 1;
        return left.index - right.index;
      })
      .map((entry) => entry.key);
  }

  it("cycles the sort on the market screen and renders the sorted rows", () => {
    const h = harness();
    h.controller.ensureSelection();
    h.controller.sortMarket("price");
    expect(h.ctx.station.marketSort).toEqual({
      column: "price",
      direction: "ascending",
    });
    expect(h.views.at(-1)?.market?.rows.map((row) => row.key)).toEqual(
      sortedKeys(h, "price"),
    );
    h.controller.sortMarket("price");
    expect(h.ctx.station.marketSort).toEqual({
      column: "price",
      direction: "descending",
    });
    h.controller.sortMarket("price");
    expect(h.ctx.station.marketSort).toBeNull();
    expect(h.views).toHaveLength(3);
  });

  it("ignores an unknown column and every guarded state", () => {
    const h = harness();
    h.controller.sortMarket("legal" as never);
    h.controller.sortMarket("__proto__" as never);
    expect(h.ctx.station.marketSort).toBeNull();

    h.ctx.runtime.paused = true;
    h.controller.sortMarket("price");
    h.ctx.runtime.paused = false;
    h.ctx.runtime.contextLost = true;
    h.controller.sortMarket("price");
    h.ctx.runtime.contextLost = false;
    h.ctx.chart.chartOpen = true;
    h.controller.sortMarket("price");
    h.ctx.chart.chartOpen = false;
    h.ctx.save.saveScreenOpen = true;
    h.controller.sortMarket("price");
    h.ctx.save.saveScreenOpen = false;
    h.ctx.station.stationScreen = "status";
    h.controller.sortMarket("price");
    h.ctx.station.stationScreen = "market";
    h.ctx.runtime.disposed = true;
    h.controller.sortMarket("price");
    h.ctx.runtime.disposed = false;
    const state = initFlightState(layout);
    state.mode = "inFlight";
    const docked = h.ctx.core.state;
    h.ctx.core.state = state;
    h.controller.sortMarket("price");
    h.ctx.core.state = docked;

    expect(h.ctx.station.marketSort).toBeNull();
    expect(h.views).toEqual([]);
  });

  it("walks the sorted order with the keys and the first selection", () => {
    const h = harness();
    h.ctx.station.marketSort = { column: "name", direction: "ascending" };
    const selectable = sortedKeys(h, "name").filter((key) =>
      h.controller.isSelectableGood(
        key,
        h.market.goods.find((good) => good.key === key)?.stock ?? 0,
      ),
    );
    expect(h.controller.selectableKeys()).toEqual(selectable);
    h.controller.ensureSelection();
    expect(h.ctx.station.stationSelection).toBe(selectable[0]);
    h.controller.moveSelection(1);
    expect(h.ctx.station.stationSelection).toBe(selectable[1]);
    h.controller.moveSelection(-2);
    expect(h.ctx.station.stationSelection).toBe(selectable.at(-1));
  });

  it("keeps the selection and a pending plan on the same commodity", () => {
    const h = harness();
    h.controller.ensureSelection();
    const selected = h.ctx.station.stationSelection;
    h.controller.stepAmount(1);
    const plan = asTrade(h.ctx.station.stationPending);
    expect(plan.key).toBe(selected);

    h.controller.sortMarket("name");
    h.controller.sortMarket("name");

    expect(h.ctx.station.stationSelection).toBe(selected);
    expect(h.ctx.station.stationPending).toBe(plan);
    const name = catalogue.find((entry) => entry.key === selected)?.name ?? "";
    expect(h.views.at(-1)?.confirmText).toContain(name);

    const creditsBefore = h.ctx.core.profile.credits;
    h.controller.confirmTrade();
    expect(h.ctx.core.profile.cargo[selected]).toBe(1);
    expect(h.ctx.core.profile.credits).toBe(creditsBefore - plan.cost);
  });
});

const equipmentCatalogue: readonly Equipment[] = parseEquipment(
  JSON.parse(
    readFileSync(
      new URL("../../../src/content/generated/equipment.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);

/** A harness docked on F3 with the equipment catalogue and a station input context. */
function outfittingHarness(credits: number) {
  const h = harness();
  h.ctx.core.equipmentCatalogue = equipmentCatalogue;
  h.ctx.core.profile = { ...newProfile(), credits };
  h.ctx.station.stationScreen = "outfitting";
  let context: InputContext = "dockScreen";
  h.ctx.runtime.input = {
    getContext: () => context,
    setContext: (next: InputContext) => {
      context = next;
    },
  } as unknown as KeyboardInputSource;
  h.controller.ensureOutfittingSelection();
  return h;
}

/** Press one station action the way the drained input does. */
function press(h: ReturnType<typeof outfittingHarness>, action: ActionId) {
  h.controller.applyStationAction(action);
}

/** Press Down until the cursor is on `key`; fails the test if it never gets there. */
function moveTo(h: ReturnType<typeof outfittingHarness>, key: string): void {
  for (let guard = 0; guard < 40; guard += 1) {
    if (h.ctx.station.stationSelection === key) return;
    press(h, "stationDown");
  }
  throw new Error(`the cursor never reached "${key}"`);
}

const SAVE_ALLOW = saveAllowLists({
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map(
    catalogue
      .filter((commodity) => commodity.tradeable)
      .map((commodity) => [commodity.key, commodity.unit]),
  ),
});

describe("laser purchase at F3", () => {
  it("in normal play, buying a beam laser for the aft mount charges 10,000 decicredits and survives a save", () => {
    const h = outfittingHarness(50_000);
    const before = h.ctx.core.profile;

    // Select Beam Laser and confirm: Oolite's facing selection opens, no prompt yet.
    moveTo(h, "EQ_WEAPON_BEAM_LASER");
    press(h, "stationConfirm");
    expect(h.ctx.station.outfittingFacingFor).toBe("EQ_WEAPON_BEAM_LASER");
    expect(h.ctx.station.stationPending).toBeNull();
    expect(h.ctx.core.profile).toBe(before);
    const open = h.views[h.views.length - 1]?.outfitting;
    expect(open?.facingFor).toBe("EQ_WEAPON_BEAM_LASER");
    expect(open?.rows.map((row) => row.label)).toEqual([
      "Forward (Pulse Laser)",
      "Aft (None)",
      "Port (None)",
      "Starboard (None)",
    ]);
    expect(open?.detail?.description).toBe(
      "Beam Laser\nPlease select where to install this weapon.",
    );

    // Select the aft facing; the first confirm only asks, the second buys.
    press(h, "stationDown");
    expect(h.ctx.station.stationSelection).toBe("EQ_WEAPON_BEAM_LASER@aft");
    press(h, "stationConfirm");
    expect(h.ctx.station.stationPending).toEqual({
      kind: "fit",
      key: "EQ_WEAPON_BEAM_LASER@aft",
    });
    expect(h.ctx.core.profile).toBe(before);
    expect(h.views[h.views.length - 1]?.confirmText).toBe(
      "Buy Beam Laser (Aft) for 1000.0 ₢? [Y/N]",
    );
    press(h, "stationConfirm");

    const after = h.ctx.core.profile;
    expect(after.laserMounts.aft).toBe("EQ_WEAPON_BEAM_LASER");
    expect(after.laserMounts.fore).toBe("EQ_WEAPON_PULSE_LASER");
    expect(after.credits).toBe(before.credits - 10_000);
    expect(h.ctx.station.outfittingFacingFor).toBeNull();
    expect(h.ctx.station.stationPending).toBeNull();
    expect(h.ctx.station.lastTrade).toEqual({
      kind: "fit",
      key: "EQ_WEAPON_BEAM_LASER@aft",
      amount: 1,
    });
    expect(h.profiles).toEqual([after]);
    expect(h.calls.filter((call) => call === "autosave")).toEqual(["autosave"]);

    // The purchase survives a reload: encode, parse and restore the profile.
    const state = h.ctx.core.state;
    if (state === undefined) throw new Error("the harness has no flight state");
    const encoded = encodeSave(
      snapshotForSave(
        state,
        after,
        system,
        { key: "coriolis-station" },
        h.ctx.core.market,
        catalogue,
        { epoch: 0, anchorNextEntityId: undefined },
      ),
    );
    const parsed = parseSave(encoded, SAVE_ALLOW);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.save.version).toBe(SAVE_VERSION);
    const restored = profileFromSave(parsed.save);
    expect(restored.laserMounts).toEqual(after.laserMounts);
    expect(restored.credits).toBe(after.credits);
  });
});

describe("laser facing selection flow", () => {
  it("Back closes the facing selection without leaving F3, with the cursor on the laser", () => {
    const h = outfittingHarness(50_000);
    moveTo(h, "EQ_WEAPON_PULSE_LASER");
    press(h, "stationConfirm");
    expect(h.ctx.station.outfittingFacingFor).toBe("EQ_WEAPON_PULSE_LASER");

    press(h, "stationBack");

    expect(h.ctx.station.stationScreen).toBe("outfitting");
    expect(h.ctx.station.outfittingFacingFor).toBeNull();
    expect(h.ctx.station.stationSelection).toBe("EQ_WEAPON_PULSE_LASER");
    expect(h.views[h.views.length - 1]?.outfitting?.facingFor).toBeNull();

    // A second Back leaves F3 for the home screen.
    press(h, "stationBack");
    expect(h.ctx.station.stationScreen).toBe("home");
  });

  it("leaving F3 by any route drops an open facing selection", () => {
    const h = outfittingHarness(50_000);
    moveTo(h, "EQ_WEAPON_BEAM_LASER");
    press(h, "stationConfirm");
    expect(h.ctx.station.outfittingFacingFor).not.toBeNull();

    h.controller.openStationScreen("stationStatus");
    expect(h.ctx.station.outfittingFacingFor).toBeNull();

    // A direct screen change followed by a render also clears it.
    h.ctx.station.stationScreen = "outfitting";
    h.ctx.station.outfittingFacingFor = "EQ_WEAPON_BEAM_LASER";
    h.ctx.station.stationScreen = "market";
    h.controller.renderStation();
    expect(h.ctx.station.outfittingFacingFor).toBeNull();
  });

  it("N cancels the Y/N prompt and keeps the facing selection open", () => {
    const h = outfittingHarness(50_000);
    moveTo(h, "EQ_WEAPON_BEAM_LASER");
    press(h, "stationConfirm");
    press(h, "stationConfirm");
    expect(h.ctx.station.stationPending).not.toBeNull();

    press(h, "stationCancel");

    expect(h.ctx.station.stationPending).toBeNull();
    expect(h.ctx.station.outfittingFacingFor).toBe("EQ_WEAPON_BEAM_LASER");
    expect(h.profiles).toEqual([]);
  });

  it("a replaced laser is refunded: a mining laser over the fore pulse costs 8,000 less 4,000", () => {
    const h = outfittingHarness(50_000);
    h.ctx.core.system = { ...h.ctx.core.system, techLevelRaw: 10 };
    moveTo(h, "EQ_WEAPON_MINING_LASER");
    press(h, "stationConfirm");
    expect(h.ctx.station.stationSelection).toBe("EQ_WEAPON_MINING_LASER@fore");
    press(h, "stationConfirm");
    press(h, "stationConfirm");

    expect(h.ctx.core.profile.laserMounts.fore).toBe("EQ_WEAPON_MINING_LASER");
    expect(h.ctx.core.profile.credits).toBe(50_000 - 8_000 + 4_000);
    expect(h.ctx.station.outfittingFacingFor).toBeNull();
    expect(h.ctx.station.stationSelection).toBe("EQ_WEAPON_MINING_LASER");
  });

  it("Remove Laser empties a facing, refunds it, and drops its own row when none is left", () => {
    const h = outfittingHarness(0);
    moveTo(h, "EQ_WEAPON_NONE");
    press(h, "stationConfirm");
    expect(h.ctx.station.outfittingFacingFor).toBe("EQ_WEAPON_NONE");
    // Only the fore facing holds a laser, so the other facings are refused.
    press(h, "stationDown");
    press(h, "stationConfirm");
    expect(h.ctx.station.stationNotice).toBe("No laser fitted");
    expect(h.ctx.station.stationPending).toBeNull();

    press(h, "stationUp");
    press(h, "stationConfirm");
    press(h, "stationConfirm");

    expect(h.ctx.core.profile.laserMounts.fore).toBe("EQ_WEAPON_NONE");
    expect(h.ctx.core.profile.credits).toBe(4_000);
    expect(h.ctx.station.lastTrade).toEqual({
      kind: "removal",
      key: "EQ_WEAPON_NONE@fore",
      amount: 1,
    });
    // No laser is left to remove, so the cursor landed on a surviving row.
    const rows = h.views[h.views.length - 1]?.outfitting?.rows ?? [];
    expect(rows.map((row) => row.key)).not.toContain("EQ_WEAPON_NONE");
    expect(rows.map((row) => row.key)).toContain(
      h.ctx.station.stationSelection,
    );
  });

  it("refuses an unaffordable facing with the short reason and moves no money", () => {
    const h = outfittingHarness(3_999);
    const before = h.ctx.core.profile;
    moveTo(h, "EQ_WEAPON_PULSE_LASER");
    press(h, "stationConfirm");

    // No facing can afford 4,000, so the row is not confirmable: no subscreen.
    expect(h.ctx.station.outfittingFacingFor).toBeNull();
    expect(h.ctx.station.stationNotice).toBe("Not enough credits");
    expect(h.ctx.core.profile).toBe(before);
    expect(h.profiles).toEqual([]);
    expect(h.calls).not.toContain("autosave");
  });

  it("a prompt that went stale (credits dropped) buys nothing", () => {
    const h = outfittingHarness(50_000);
    moveTo(h, "EQ_WEAPON_BEAM_LASER");
    press(h, "stationConfirm");
    press(h, "stationDown");
    press(h, "stationConfirm");
    expect(h.ctx.station.stationPending).not.toBeNull();

    h.ctx.core.profile = { ...h.ctx.core.profile, credits: 9_999 };
    const stale = h.ctx.core.profile;
    press(h, "stationConfirm");

    expect(h.ctx.core.profile).toBe(stale);
    expect(h.ctx.core.profile.laserMounts.aft).toBe("EQ_WEAPON_NONE");
    expect(h.ctx.station.stationPending).toBeNull();
    expect(h.ctx.station.lastTrade).toBeNull();
    expect(h.calls).not.toContain("autosave");
  });

  it("a forged composite selection is refused as not offered and reaches no money path", () => {
    const h = outfittingHarness(1_000_000);
    const before = h.ctx.core.profile;
    for (const forged of [
      "EQ_ECM@fore",
      "EQ_WEAPON_PULSE_LASER@up",
      "EQ_WEAPON_THARGOID_LASER@fore",
      "EQ_WEAPON_BEAM_LASER@aft",
    ]) {
      // The facing selection is closed, so no composite key is a row.
      h.ctx.station.outfittingFacingFor = null;
      h.ctx.station.stationSelection = forged;
      h.ctx.station.stationPending = { kind: "fit", key: forged };
      press(h, "stationConfirm");
      expect(h.ctx.station.stationNotice).toBe("Not offered");
      expect(h.ctx.core.profile).toBe(before);
    }
    expect(h.profiles).toEqual([]);

    // With the selection open for another laser, a composite key of a
    // different laser is still not a row.
    h.ctx.station.outfittingFacingFor = "EQ_WEAPON_PULSE_LASER";
    h.ctx.station.stationSelection = "EQ_WEAPON_BEAM_LASER@aft";
    h.ctx.station.stationPending = {
      kind: "fit",
      key: "EQ_WEAPON_BEAM_LASER@aft",
    };
    press(h, "stationConfirm");
    expect(h.ctx.station.stationNotice).toBe("Not offered");
    expect(h.ctx.core.profile).toBe(before);
  });

  it("a forged facing-selection state for a non-laser key shows the main list and buys nothing", () => {
    const h = outfittingHarness(1_000_000);
    const before = h.ctx.core.profile;
    h.ctx.station.outfittingFacingFor = "EQ_ECM";
    expect(h.controller.outfittingModel()?.facingFor).toBeNull();
    h.ctx.station.stationSelection = "EQ_ECM";
    press(h, "stationConfirm");
    expect(h.ctx.station.stationNotice).toBe("Not offered");
    expect(h.ctx.core.profile).toBe(before);
  });
});

describe("F3 lists only what can be fitted (quick task 261118-emk)", () => {
  it("buying the fourth missile hides its row and the cursor lands on Remove Missile without buying it", () => {
    const h = outfittingHarness(50_000);
    moveTo(h, "EQ_MISSILE");
    press(h, "stationConfirm");
    expect(h.ctx.station.stationPending).toEqual({
      kind: "fit",
      key: "EQ_MISSILE",
    });
    press(h, "stationConfirm");

    expect(h.ctx.core.profile.missiles).toBe(4);
    const rows = h.controller.outfittingModel()?.rows ?? [];
    expect(rows.map((row) => row.key)).not.toContain("EQ_MISSILE");
    expect(h.ctx.station.stationSelection).toBe("EQ_MISSILE_REMOVAL");

    // One further Y only opens the guard on the row now under the cursor.
    const bought = h.ctx.core.profile;
    press(h, "stationConfirm");
    expect(h.ctx.station.stationPending).toEqual({
      kind: "fit",
      key: "EQ_MISSILE_REMOVAL",
    });
    expect(h.ctx.core.profile).toBe(bought);
    expect(h.calls.filter((call) => call === "autosave")).toEqual(["autosave"]);
  });

  it("an empty list (raw TL 0, full tank) makes Y, Up and Down inert", () => {
    const h = outfittingHarness(1_000);
    h.ctx.core.system = { ...h.ctx.core.system, techLevelRaw: 0 };
    h.controller.ensureOutfittingSelection();
    expect(h.ctx.station.stationSelection).toBe("");
    const model = h.controller.outfittingModel();
    expect(model?.rows).toEqual([]);
    expect(model?.emptyText).toBe("No equipment available for purchase.");

    const before = h.ctx.core.profile;
    for (const action of [
      "stationConfirm",
      "stationUp",
      "stationDown",
      "stationConfirm",
    ] as const) {
      press(h, action);
      expect(h.ctx.station.stationNotice).toBe("");
      expect(h.ctx.station.stationPending).toBeNull();
      expect(h.ctx.station.stationSelection).toBe("");
      expect(h.ctx.core.profile).toBe(before);
    }
    expect(h.profiles).toEqual([]);
    expect(h.calls).not.toContain("autosave");
  });
});

/** One real galaxy-0 system record by id (Tibedied `g0-s0` is raw tech level 8). */
function galaxyZeroSystem(id: string): System {
  const systems = JSON.parse(
    readFileSync(
      new URL(
        "../../../src/content/generated/systems/g0.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as System[];
  const found = systems.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no galaxy-0 system "${id}"`);
  return found;
}

/** An F3 harness docked at `systemId` with `damaged` damaged and none installed. */
function repairHarness(
  credits: number,
  systemId: string,
  damaged: readonly string[],
) {
  const h = outfittingHarness(credits);
  h.ctx.core.system = galaxyZeroSystem(systemId);
  h.ctx.core.profile = { ...h.ctx.core.profile, damagedEquipment: damaged };
  h.controller.ensureOutfittingSelection();
  return h;
}

describe("repairing damaged equipment at F3 (Phase 19, D-08 to D-10)", () => {
  it("repairs a damaged docking computer at Tibedied for 750.0 credits in two presses, one commit, one autosave", () => {
    const h = repairHarness(10_000, "g0-s0", ["EQ_DOCK_COMP"]);
    const before = h.ctx.core.profile;
    const rows = h.controller.outfittingModel()?.rows ?? [];
    expect(rows.map((row) => row.key)).toContain("EQ_DOCK_COMP@repair");
    expect(rows.map((row) => row.key)).not.toContain("EQ_DOCK_COMP");
    const repairRow = rows.find((row) => row.key === "EQ_DOCK_COMP@repair");
    expect(repairRow?.label).toBe("Repair: Docking Computers");
    expect(repairRow?.priceText).toBe("750.0 ₢");
    expect(repairRow?.verb).toBe("Repair");

    moveTo(h, "EQ_DOCK_COMP@repair");
    press(h, "stationConfirm");
    expect(h.ctx.station.stationPending).toEqual({
      kind: "fit",
      key: "EQ_DOCK_COMP@repair",
    });
    expect(h.ctx.core.profile).toBe(before);
    expect(h.views[h.views.length - 1]?.confirmText).toBe(
      "Repair Docking Computers for 750.0 ₢? [Y/N]",
    );

    press(h, "stationConfirm");
    const after = h.ctx.core.profile;
    expect(after.credits).toBe(2_500);
    expect(after.equipment.at(-1)).toBe("EQ_DOCK_COMP");
    expect(after.damagedEquipment).toEqual([]);
    expect(h.ctx.station.stationPending).toBeNull();
    expect(h.ctx.station.stationNotice).toBe("");
    expect(h.ctx.station.lastTrade).toEqual({
      kind: "repair",
      key: "EQ_DOCK_COMP@repair",
      amount: 1,
    });
    expect(h.profiles).toEqual([after]);
    expect(h.calls.filter((call) => call === "autosave")).toEqual(["autosave"]);
    // D-10: fitted at once, so the next step's equipment set holds it again.
    expect(h.controller.equipmentSet().has("EQ_DOCK_COMP")).toBe(true);
    // The repair row is gone and the cursor clamped onto a row that exists.
    const rowsAfter = h.controller.outfittingModel()?.rows ?? [];
    expect(rowsAfter.map((row) => row.key)).not.toContain(
      "EQ_DOCK_COMP@repair",
    );
    expect(rowsAfter.map((row) => row.key)).toContain(
      h.ctx.station.stationSelection,
    );
  });

  it("keeps the Buy verb on an ordinary purchase prompt", () => {
    const h = outfittingHarness(50_000);
    moveTo(h, "EQ_MISSILE");
    press(h, "stationConfirm");
    expect(h.views[h.views.length - 1]?.confirmText).toMatch(
      /^Buy Missile for .* ₢\? \[Y\/N\]$/,
    );
  });

  it("charges the price of the catalogue record read at the second Y, never a row's", () => {
    const h = repairHarness(20_000, "g0-s0", ["EQ_DOCK_COMP"]);
    moveTo(h, "EQ_DOCK_COMP@repair");
    press(h, "stationConfirm");
    expect(h.views[h.views.length - 1]?.confirmText).toBe(
      "Repair Docking Computers for 750.0 ₢? [Y/N]",
    );

    // The catalogue is replaced between the two presses: the price is only as
    // trustworthy as the lookup (cross-AI review, Fable 19-05).
    h.ctx.core.equipmentCatalogue = equipmentCatalogue.map((record) =>
      record.key === "EQ_DOCK_COMP" ? { ...record, price: 16_000 } : record,
    );
    press(h, "stationConfirm");

    expect(h.ctx.core.profile.credits).toBe(20_000 - 8_000);
    expect(h.ctx.core.profile.damagedEquipment).toEqual([]);
  });

  it("a repair never reaches the purchase path (T-19-20)", () => {
    const h = repairHarness(10_000, "g0-s0", ["EQ_DOCK_COMP"]);
    moveTo(h, "EQ_DOCK_COMP@repair");
    press(h, "stationConfirm");
    // Stale state under the prompt: the item is repaired elsewhere, so the
    // second Y finds nothing to repair and must not buy a second copy.
    h.ctx.core.profile = {
      ...h.ctx.core.profile,
      equipment: ["EQ_DOCK_COMP"],
      damagedEquipment: [],
    };
    const stale = h.ctx.core.profile;
    press(h, "stationConfirm");
    expect(h.ctx.core.profile).toBe(stale);
    expect(h.ctx.station.stationPending).toBeNull();
    expect(h.profiles).toEqual([]);
    expect(h.calls).not.toContain("autosave");
  });

  it("a forged repair selection shows Not offered and changes nothing", () => {
    const h = repairHarness(10_000, "g0-s0", ["EQ_DOCK_COMP"]);
    const before = h.ctx.core.profile;
    for (const forged of [
      "EQ_ECM@repair",
      "EQ_DOCK_COMP@fore",
      "EQ_CARGO_BAY@repair",
    ]) {
      h.ctx.station.stationSelection = forged;
      h.ctx.station.stationPending = null;
      press(h, "stationConfirm");
      expect(h.ctx.station.stationNotice).toBe("Not offered");
      expect(h.ctx.station.stationPending).toBeNull();
      expect(h.ctx.core.profile).toBe(before);
    }
    expect(h.profiles).toEqual([]);
    expect(h.calls).not.toContain("autosave");
  });
});
