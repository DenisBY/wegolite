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
import type { Equipment } from "../../../src/content/types.js";
import type { ActionId } from "../../../src/input/actions.js";
import type { InputContext } from "../../../src/input/actions.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import {
  profileFromSave,
  snapshotForSave,
} from "../../../src/persistence/autosave.js";
import { encodeSave, parseSave } from "../../../src/persistence/save.js";
import type { SaveAllowLists } from "../../../src/persistence/save.js";
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

const SAVE_ALLOW: SaveAllowLists = {
  equipment: new Set(["EQ_DOCK_COMP"]),
  systems: new Set(["g0-s7"]),
  stations: new Set(["coriolis-station"]),
  commodities: new Map(
    catalogue
      .filter((commodity) => commodity.tradeable)
      .map((commodity) => [commodity.key, commodity.unit]),
  ),
  marketGoods: new Set(catalogue.map((commodity) => commodity.key)),
};

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
    expect(parsed.save.version).toBe(4);
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
