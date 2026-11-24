// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station controller (Phase 8, D-12 step 5, ARCHITECTURE.md section 4.2).
 *
 * Everything the docked station computer does: the market selection, the trade
 * and fitting flows, the station navigation tabs, the station screen render and
 * the drained station actions. The bodies are the ones `createGameSession`
 * carried before the split, reading live fields through `ctx` at every call
 * (G-8); a profile update keeps the spread form and a refused plan leaves the
 * profile object untouched.
 *
 * The controller registers no listener on construction. The pieces it reaches
 * outside the context (the chart and Save/Load screens, the autosave, the
 * economy probe) arrive as dependency functions, so a Node unit test can drive
 * it with doubles and a split step that moves their owners does not touch it.
 */

import type { Commodity, Equipment, System } from "../../content/types.js";
import type { ActionId } from "../../input/actions.js";
import {
  ACTION_CONTEXTS,
  DEFAULT_BINDINGS,
  STATION_NAV_ACTIONS,
} from "../../input/actions.js";
import type { Command } from "../../sim/commands.js";
import { availablePods } from "../../sim/economy/cargo.js";
import {
  applyBuy,
  applySell,
  planBuy,
  planSell,
} from "../../sim/economy/trade.js";
import type { TradePlan, TradeSide } from "../../sim/economy/trade.js";
import type { FlightState } from "../../sim/flight/state.js";
import { NO_LASER } from "../../sim/combat/mounts.js";
import {
  FUEL_CAPACITY,
  MAX_MISSILES,
  applyFit,
  applyLaserFit,
  applyRepair,
  checkFit,
  checkLaserFit,
  checkRepair,
  isLaserFitKey,
  laserPriceMap,
  parseLaserFitKey,
  parseRepairFitKey,
} from "../../sim/player/outfitting.js";
import type {
  FitContext,
  LaserFitContext,
} from "../../sim/player/outfitting.js";
import { formatDecicredits } from "../../sim/player/profile.js";
import type { PlayerProfile } from "../../sim/player/profile.js";
import type { SaveStatus } from "../../persistence/store.js";
import { formatFuel } from "../../ui/docked.js";
import {
  chartHints,
  dockedHints,
  saveLoadHints,
} from "../../ui/station-hints.js";
import {
  buildHomeModel,
  buildMarketModel,
  buildOutfittingModel,
  buildStatusModel,
  buildInterfacesModel,
  isMarketRowSelectable,
  isMarketSortColumn,
  nextMarketSort,
  sortMarketGoods,
  tradeNoticeText,
} from "../../ui/station-model.js";
import type {
  MarketSortColumn,
  OutfittingModel,
} from "../../ui/station-model.js";
import { activeTabId, isTabEnabled, tabById } from "../../ui/station-tabs.js";
import type { StationNavState, StationTabId } from "../../ui/station-tabs.js";
import type { LaunchSequence } from "../launch-sequence.js";
import type {
  StationScreen,
  StationShell,
  StationView,
} from "../../ui/station.js";
import type { SessionState } from "./context.js";

/** What the controller calls outside the session context. */
export interface StationControllerDeps {
  /** The station shell: the only DOM the render writes. */
  readonly docked: Pick<StationShell, "setFuel" | "render">;
  /** The session's command queue; a tab-strip Launch click pushes onto it. */
  readonly pending: Command[];
  /** The 04-05 seam, called after every accepted profile change. */
  readonly onProfileChanged: (profile: PlayerProfile) => void;
  /** The committed target record, resolved through the validated catalogue. */
  readonly targetSystem: () => System | undefined;
  /** Whether a save with this boot status may be replaced. */
  readonly canOverwrite: (status: SaveStatus) => boolean;
  /** The probe publisher's economy and station publication. */
  readonly syncEconomyProbe: () => void;
  /** The autosave anchor a purchase or fitting takes. */
  readonly autosave: () => void;
  readonly openChart: () => void;
  readonly closeChart: () => void;
  readonly openSaveScreen: () => void;
  readonly closeSaveScreen: () => void;
  /**
   * The launch pre-roll (quick 261118-os8): while it runs the docked session
   * reports `launching` to the tab strip, so the strip hides as it does during
   * the sim launch.
   */
  readonly launchSequence: Pick<LaunchSequence, "preRolling">;
}

export function createStationController(
  ctx: SessionState,
  deps: StationControllerDeps,
) {
  const {
    docked,
    pending,
    onProfileChanged,
    targetSystem,
    canOverwrite,
    syncEconomyProbe,
    autosave,
    openChart,
    closeChart,
    openSaveScreen,
    closeSaveScreen,
    launchSequence,
  } = deps;

  /**
   * A market row is reachable when it can be bought **or** when the hold
   * carries some of it. A zero-stock row you hold is dimmed but still
   * selectable, or the canonical run (sell Computers at a Lave with no stock)
   * would be unreachable.
   */
  function isSelectableGood(key: string, stock: number): boolean {
    const catalogue = ctx.core.commodities;
    if (catalogue === undefined) return false;
    const commodity = catalogue.find((entry) => entry.key === key);
    if (commodity === undefined) return false;
    return isMarketRowSelectable(
      commodity.tradeable,
      stock,
      ctx.core.profile.cargo[key] ?? 0,
    );
  }

  /**
   * The market goods in the order F8 paints them: the heading-click sort
   * when one is active, otherwise the catalogue order. The keys, the first
   * selection and the painted rows all walk this one order.
   */
  function orderedGoods() {
    const currentMarket = ctx.core.market;
    if (currentMarket === undefined) return [];
    return sortMarketGoods(
      currentMarket.goods,
      ctx.station.marketSort,
      ctx.core.commodities ?? [],
      ctx.core.profile.cargo,
    );
  }

  /** The first commodity a player can actually trade in this market. */
  function ensureSelection(): void {
    const currentMarket = ctx.core.market;
    if (currentMarket === undefined) return;
    const selectedGood = currentMarket.goods.find(
      (good) => good.key === ctx.station.stationSelection,
    );
    if (
      selectedGood !== undefined &&
      isSelectableGood(selectedGood.key, selectedGood.stock)
    ) {
      return;
    }
    const first = orderedGoods().find((good) =>
      isSelectableGood(good.key, good.stock),
    );
    ctx.station.stationSelection = first?.key ?? "";
  }

  function selectableKeys(): readonly string[] {
    return orderedGoods()
      .filter((good) => isSelectableGood(good.key, good.stock))
      .map((good) => good.key);
  }

  function moveSelection(delta: number): void {
    const keys = selectableKeys();
    if (keys.length === 0) return;
    const current = keys.indexOf(ctx.station.stationSelection);
    const base = current === -1 ? 0 : current;
    const next = (base + delta + keys.length) % keys.length;
    const nextKey = keys[next];
    if (nextKey !== undefined) ctx.station.stationSelection = nextKey;
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
  }

  /**
   * The profile's equipment as a set, rebuilt only when the list changes.
   *
   * Profiles are immutable, so the array identity is the cache key. The fixed
   * step asks for this 120 times a second.
   */
  function equipmentSet(): ReadonlySet<string> {
    if (ctx.core.equipmentSetSource !== ctx.core.profile.equipment) {
      ctx.core.equipmentSetSource = ctx.core.profile.equipment;
      ctx.core.equipmentSetCache = new Set(ctx.core.profile.equipment);
    }
    return ctx.core.equipmentSetCache;
  }

  /** The live FitContext; every field is derived from the validated profile. */
  function fitContext(): FitContext | undefined {
    const catalogue = ctx.core.equipmentCatalogue;
    const missile = catalogue?.find((entry) => entry.key === "EQ_MISSILE");
    if (missile === undefined) return undefined;
    return {
      techLevelRaw: ctx.core.system.techLevelRaw,
      fuelCapacity: FUEL_CAPACITY,
      missileCapacity: MAX_MISSILES,
      availablePods: availablePods(ctx.core.profile, ctx.core.commodityUnits),
      missilePrice: missile.price,
    };
  }

  /** The laser path's context: the live fit context plus the catalogue laser prices. */
  function laserFitContext(): LaserFitContext | undefined {
    const catalogue = ctx.core.equipmentCatalogue;
    const base = fitContext();
    if (catalogue === undefined || base === undefined) return undefined;
    return { ...base, laserPrices: laserPriceMap(catalogue) };
  }

  function outfittingModel(): OutfittingModel | undefined {
    const catalogue = ctx.core.equipmentCatalogue;
    if (catalogue === undefined) return undefined;
    return buildOutfittingModel(
      catalogue,
      ctx.core.profile,
      ctx.core.system.techLevelRaw,
      ctx.station.stationSelection,
      ctx.core.commodityUnits,
      ctx.station.outfittingFacingFor,
    );
  }

  /**
   * Back inside the facing selection: close it and stay on F3, with the cursor
   * on the laser that opened it.
   */
  function closeFacingSelection(): void {
    const opener = ctx.station.outfittingFacingFor;
    ctx.station.outfittingFacingFor = null;
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    if (opener !== null) ctx.station.stationSelection = opener;
    ensureOutfittingSelection();
    renderStation();
  }

  /** Reset F3 to its first visible row (and clear its pending confirmation). */
  function ensureOutfittingSelection(): void {
    const model = outfittingModel();
    if (model === undefined) {
      ctx.station.stationSelection = "";
      return;
    }
    if (!model.rows.some((row) => row.key === ctx.station.stationSelection)) {
      ctx.station.stationSelection = model.rows[0]?.key ?? "";
    }
  }

  /** Up/Down on F3; the list clamps at both ends and never wraps. */
  function moveOutfittingSelection(delta: number): void {
    const model = outfittingModel();
    if (model === undefined || model.rows.length === 0) return;
    let index = model.rows.findIndex(
      (row) => row.key === ctx.station.stationSelection,
    );
    if (index === -1) index = 0;
    const next = Math.min(model.rows.length - 1, Math.max(0, index + delta));
    const row = model.rows[next];
    if (row !== undefined) ctx.station.stationSelection = row.key;
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
  }

  /** The blunt refusal copy; a clamped plan's notice comes from the view model. */
  function commodityFor(key: string): Commodity | undefined {
    return ctx.core.commodities?.find((entry) => entry.key === key);
  }

  function pendingPlan(): TradePlan | null {
    return ctx.station.stationPending !== null &&
      !("kind" in ctx.station.stationPending)
      ? ctx.station.stationPending
      : null;
  }

  /**
   * The plain-data request both plans read. `units` is ignored by `planSell`
   * and required by `planBuy`, so one builder serves both.
   */
  function tradeRequest(amount: number) {
    const currentMarket = ctx.core.market;
    const catalogue = ctx.core.commodities;
    const commodity = catalogue?.find(
      (entry) => entry.key === ctx.station.stationSelection,
    );
    if (currentMarket === undefined || commodity === undefined)
      return undefined;
    return {
      market: currentMarket,
      profile: ctx.core.profile,
      commodity,
      units: ctx.core.commodityUnits,
      amount,
    };
  }

  function planFor(side: TradeSide, amount: number): TradePlan | undefined {
    const request = tradeRequest(amount);
    if (request === undefined) return undefined;
    return side === "buy" ? planBuy(request) : planSell(request);
  }

  /**
   * D-06: one unit per press. Right grows a buy and shrinks a sell; Left grows
   * a sell and shrinks a buy. Reaching zero clears the pending trade silently —
   * `zeroAmount` is never player-facing copy.
   */
  function stepAmount(direction: 1 | -1): void {
    if (ctx.station.stationScreen !== "market") return;
    const current = pendingPlan();
    // With no pending trade the press itself picks the side: Right buys, Left
    // sells. With one pending, the press moves that trade in its own direction.
    const side: TradeSide =
      current === null ? (direction > 0 ? "buy" : "sell") : current.side;
    const amount =
      current === null
        ? 1
        : current.amount + (side === "buy" ? direction : -direction);

    if (amount <= 0) {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "";
      renderStation();
      return;
    }

    const plan = planFor(side, amount);
    if (plan === undefined) return;
    if (plan.ok) {
      ctx.station.stationPending = plan;
      // A clamp's copy is derived by the view model from the plan itself.
      ctx.station.stationNotice = "";
    } else {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = tradeNoticeText(plan, commodityFor(plan.key));
    }
    renderStation();
  }

  /**
   * Shift+arrow: plan the largest feasible trade. The request is "as much as
   * possible", so a feasible plan carries no clamp — only a zero-feasible plan
   * has a reason to state.
   */
  function planMax(side: TradeSide): void {
    if (ctx.station.stationScreen !== "market") return;
    const plan = planFor(side, Number.MAX_SAFE_INTEGER);
    if (plan === undefined) return;
    if (plan.ok) {
      ctx.station.stationPending = { ...plan, clamp: undefined };
      ctx.station.stationNotice = "";
    } else {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = tradeNoticeText(plan, commodityFor(plan.key));
    }
    renderStation();
  }

  function confirmTrade(): void {
    if (ctx.station.stationScreen !== "market") return;
    const plan = pendingPlan();
    if (plan === null) return;
    const request = tradeRequest(plan.amount);
    if (request === undefined) return;

    const applied =
      plan.side === "buy" ? applyBuy(request, plan) : applySell(request, plan);
    if (applied === undefined) {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "That trade is no longer available";
      renderStation();
      return;
    }
    ctx.core.market = applied.market;
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    ctx.station.lastTrade = {
      kind: plan.side,
      key: plan.key,
      amount: plan.amount,
    };
    commitProfile(applied.profile);
    autosave();
  }

  /**
   * F3 `[Y/N]` (D-16, ECON-05/ECON-08).
   *
   * Two states: the first confirm opens the prompt, the second re-checks the
   * same key and applies it. A disabled row never sets a prompt and never
   * reaches `applyFit`. F3 lists only the items that can be fitted here
   * (`isListedForPurchase`), so a committed purchase or removal can hide the
   * selected row: the fourth missile fills the pylons, a bought item is fitted,
   * a berth fills the hold, a removal leaves nothing to remove. The selection
   * then clamps by position onto the row now at that place, and a further Y
   * only opens the guard (or lands on an unaffordable row) — it can never buy
   * the next row. With nothing listed, Y does nothing, as on Oolite's list with
   * no selectable row (`setNoSelectedRow`).
   */
  function confirmFit(): void {
    if (ctx.station.stationScreen !== "outfitting") return;
    const catalogue = ctx.core.equipmentCatalogue;
    const fitCtx = fitContext();
    if (catalogue === undefined || fitCtx === undefined) return;

    const pendingFit =
      ctx.station.stationPending !== null &&
      "kind" in ctx.station.stationPending
        ? ctx.station.stationPending
        : null;
    const key = pendingFit?.key ?? ctx.station.stationSelection;
    const model = outfittingModel();
    if (model !== undefined && model.rows.length === 0) {
      // Oolite's empty list has no selectable row: no notice, no prompt.
      if (ctx.station.stationPending !== null) {
        ctx.station.stationPending = null;
        renderStation();
      }
      return;
    }
    // A composite row key (`EQ_WEAPON_BEAM_LASER@aft`) parses through both
    // laser allow-lists; the row lookup below is the first gate, this the second.
    const laser = parseLaserFitKey(key);
    // A repair row key (`EQ_DOCK_COMP@repair`) parses through the repair
    // allow-list and is routed to `confirmRepair` only, never to `checkFit` or
    // `applyFit` (T-19-20). The item is read from the live catalogue by the
    // parsed key, never from row state (D-08).
    const repairKey = parseRepairFitKey(key);
    const item = catalogue.find(
      (entry) => entry.key === (laser?.key ?? repairKey ?? key),
    );
    const row = model?.rows.find((entry) => entry.key === key);
    if (item === undefined || row === undefined) {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "Not offered";
      renderStation();
      return;
    }
    if (!row.confirmable) {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = row.reason;
      renderStation();
      return;
    }
    // A laser row on the main list opens Oolite's facing selection; the
    // Y/N guard comes with the facing (`PlayerEntity.m:8204-8540`).
    if (laser === null && isLaserFitKey(key)) {
      ctx.station.outfittingFacingFor = key;
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "";
      ctx.station.stationSelection = outfittingModel()?.rows[0]?.key ?? "";
      renderStation();
      return;
    }
    if (pendingFit === null) {
      ctx.station.stationPending = { kind: "fit", key };
      ctx.station.stationNotice = "";
      renderStation();
      return;
    }

    const indexBefore =
      model?.rows.findIndex((entry) => entry.key === key) ?? -1;
    if (laser !== null) {
      confirmLaserFit(item, laser);
      return;
    }
    if (repairKey !== null) {
      confirmRepair(item, key, indexBefore);
      return;
    }
    const check = checkFit(ctx.core.profile, item, fitCtx);
    if (!check.ok) {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = row.reason;
      renderStation();
      return;
    }
    const next = applyFit(ctx.core.profile, item, fitCtx);
    if (next === ctx.core.profile) {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = row.reason;
      renderStation();
      return;
    }
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    ctx.station.lastTrade = {
      kind: key.endsWith("_REMOVAL") ? "removal" : "fit",
      key,
      amount: 1,
    };
    commitProfile(next);
    autosave();
    // Clamp by position: a removed last row leaves the cursor on the new last row.
    const after = outfittingModel();
    if (
      after !== undefined &&
      !after.rows.some((entry) => entry.key === ctx.station.stationSelection)
    ) {
      const fallback = after.rows[Math.min(indexBefore, after.rows.length - 1)];
      ctx.station.stationSelection = fallback?.key ?? "";
    }
    renderStation();
  }

  /**
   * The second confirm of a repair (D-08 to D-10): re-check with `checkRepair`,
   * apply with `applyRepair`, record, commit, autosave and clamp the cursor by
   * position as `confirmFit` does. `applyRepair` returns the same profile on a
   * refusal, so an identity result means the state moved under the prompt: a
   * notice and no commit. The repair takes no time input and never touches the
   * clock; the item counts again at once (D-10).
   */
  function confirmRepair(
    item: Equipment,
    rowKey: string,
    indexBefore: number,
  ): void {
    const fitCtx = fitContext();
    const refuse = (): void => {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "That repair is no longer available";
      renderStation();
    };
    if (fitCtx === undefined) {
      refuse();
      return;
    }
    if (!checkRepair(ctx.core.profile, item, fitCtx).ok) {
      refuse();
      return;
    }
    const next = applyRepair(ctx.core.profile, item, fitCtx);
    if (next === ctx.core.profile) {
      refuse();
      return;
    }
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    ctx.station.lastTrade = { kind: "repair", key: rowKey, amount: 1 };
    commitProfile(next);
    autosave();
    // Clamp by position: the repair row is gone, so the cursor lands on the
    // row now at that place.
    const after = outfittingModel();
    if (
      after !== undefined &&
      !after.rows.some((entry) => entry.key === ctx.station.stationSelection)
    ) {
      const fallback = after.rows[Math.min(indexBefore, after.rows.length - 1)];
      ctx.station.stationSelection = fallback?.key ?? "";
    }
    renderStation();
  }

  /**
   * The second confirm of a laser fit: re-check through the laser allow-lists,
   * apply, record, commit, and return to the main list (CBT-05, T-13-18).
   */
  function confirmLaserFit(
    item: Equipment,
    laser: NonNullable<ReturnType<typeof parseLaserFitKey>>,
  ): void {
    const laserCtx = laserFitContext();
    // The row was confirmable a moment ago, so a refusal here means the state
    // moved under the prompt.
    const refuse = (): void => {
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "That fit is no longer available";
      renderStation();
    };
    if (laserCtx === undefined) {
      refuse();
      return;
    }
    const check = checkLaserFit(ctx.core.profile, item, laser.facing, laserCtx);
    if (!check.ok) {
      refuse();
      return;
    }
    const next = applyLaserFit(ctx.core.profile, item, laser.facing, laserCtx);
    if (next === ctx.core.profile) {
      refuse();
      return;
    }
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    ctx.station.lastTrade = {
      kind: laser.key === NO_LASER ? "removal" : "fit",
      key: `${laser.key}@${laser.facing}`,
      amount: 1,
    };
    // Back to the main list, with the cursor on the laser just handled; if
    // that row is gone (the last Remove Laser), `ensureOutfittingSelection`
    // lands it on the first row.
    ctx.station.outfittingFacingFor = null;
    ctx.station.stationSelection = laser.key;
    commitProfile(next);
    autosave();
    ensureOutfittingSelection();
    renderStation();
  }

  function cancelTrade(): void {
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    renderStation();
  }

  /**
   * The tab strip's inputs: the base station screen plus the overlay flag. A
   * docked session in the launch pre-roll reports `launching` (quick
   * 261118-os8, design decision 8).
   */
  function currentNavState(currentState: FlightState): StationNavState {
    return {
      mode:
        currentState.mode === "docked" && launchSequence.preRolling
          ? "launching"
          : currentState.mode,
      paused: ctx.runtime.paused,
      overlay: ctx.save.saveScreenOpen
        ? "saveScreen"
        : ctx.chart.chartOpen
          ? "chart"
          : "none",
      screen: ctx.station.stationScreen,
      page: ctx.station.stationPage,
    };
  }

  /**
   * Keep the balance in the chart and Save/Load headers current. The station
   * header owns `[data-field="credits"]` through the shell; these two overlays
   * cover it, so they carry their own fields. The chart also opens in flight,
   * where the balance is still the live profile's.
   */
  function syncHeaderCredits(): void {
    // The overlays' header fields live in the page; a Node unit test has none.
    if (typeof document === "undefined") return;
    const text = formatDecicredits(ctx.core.profile.credits);
    for (const field of ["chart-credits", "save-credits"]) {
      const element = document.querySelector(`[data-field="${field}"]`);
      if (element instanceof HTMLElement && element.textContent !== text) {
        element.textContent = text;
      }
    }
  }

  /** Mutate the strip in place; cheap and idempotent (the hydrator caches). */
  function syncStationNav(): void {
    syncHeaderCredits();
    const currentState = ctx.core.state;
    if (ctx.station.stationNav === undefined || currentState === undefined)
      return;
    ctx.station.stationNav.sync(
      currentNavState(currentState),
      ctx.runtime.bindings ?? DEFAULT_BINDINGS,
    );
  }

  /** Refresh the strip and every footer's live hints after a rebind. */
  function refreshStationChrome(): void {
    const map = ctx.runtime.bindings ?? DEFAULT_BINDINGS;
    if (ctx.core.state?.mode === "docked") renderStation();
    ctx.chart.chart?.setHints(chartHints(map));
    ctx.save.saveLoad?.setHints(saveLoadHints(map));
    syncStationNav();
  }

  function renderStation(): void {
    // The facing selection belongs to F3 alone.
    if (ctx.station.stationScreen !== "outfitting") {
      ctx.station.outfittingFacingFor = null;
    }
    const currentMarket = ctx.core.market;
    const catalogue = ctx.core.commodities;
    if (currentMarket === undefined || catalogue === undefined) return;

    const equipment = ctx.core.equipmentCatalogue;
    const marketModel = buildMarketModel(
      currentMarket,
      ctx.core.profile,
      catalogue,
      ctx.station.stationSelection,
      { pending: pendingPlan(), notice: ctx.station.stationNotice },
      ctx.station.marketSort,
    );
    const outModel =
      equipment === undefined
        ? undefined
        : buildOutfittingModel(
            equipment,
            ctx.core.profile,
            ctx.core.system.techLevelRaw,
            ctx.station.stationSelection,
            ctx.core.commodityUnits,
            ctx.station.outfittingFacingFor,
          );
    const statusModel =
      ctx.core.labels === undefined || equipment === undefined
        ? undefined
        : buildStatusModel(
            ctx.core.profile,
            ctx.core.system,
            ctx.core.labels,
            equipment,
            catalogue,
            ctx.station.stationPage,
            targetSystem()?.name,
          );
    const homeModel =
      ctx.core.labels === undefined || equipment === undefined
        ? undefined
        : buildHomeModel({
            profile: ctx.core.profile,
            system: ctx.core.system,
            targetSystem: targetSystem(),
            labels: ctx.core.labels,
            equipment,
            commodities: catalogue,
            market: currentMarket,
          });
    let confirmText = "";
    let noticeText = ctx.station.stationNotice;
    if (ctx.station.stationScreen === "market") {
      confirmText = marketModel.confirmText ?? "";
      noticeText = marketModel.noticeText;
    } else if (ctx.station.stationScreen === "outfitting") {
      const pendingFit =
        ctx.station.stationPending !== null &&
        "kind" in ctx.station.stationPending
          ? ctx.station.stationPending
          : null;
      const row = outModel?.rows.find(
        (entry) =>
          entry.key === (pendingFit?.key ?? ctx.station.stationSelection),
      );
      if (pendingFit !== null && row !== undefined) {
        confirmText = `${row.verb} ${row.name} for ${formatDecicredits(row.cost)}? [Y/N]`;
      }
    }

    const saveText = canOverwrite(ctx.save.saveStatus)
      ? ctx.station.stationSaveNotice
      : "Saving is disabled — this save is read-only";

    const view: StationView = {
      screen: ctx.station.stationScreen,
      systemName: ctx.core.system.name,
      creditsText: formatDecicredits(ctx.core.profile.credits),
      fuelText: formatFuel(ctx.core.profile.fuel),
      message: ctx.station.stationMessage,
      keysText: dockedHints(
        ctx.runtime.bindings ?? DEFAULT_BINDINGS,
        ctx.station.stationScreen,
        ctx.station.stationPage,
      ),
      confirmText,
      noticeText,
      saveText,
      home: homeModel,
      market: marketModel,
      outfitting: outModel,
      status: statusModel,
      interfaces: buildInterfacesModel(),
    };
    docked.setFuel(formatFuel(ctx.core.profile.fuel));
    docked.render(view);
    syncStationNav();
    syncEconomyProbe();
  }

  /**
   * Commit an accepted profile change: publish it to the 04-05 seam, then
   * refresh the station header/market. A refusal returns `false` and changes
   * nothing.
   *
   * Only a docked session rebuilds the station view. In flight (the damage
   * flow commits once per damage event inside the fixed step, Phase 19 review
   * WR-01) the panel is hidden and is rebuilt on dock anyway, so the commit
   * publishes only the economy probe: no model builder runs, so none can throw
   * into `router.dispatch`, and a heavy hit costs no view rebuilds.
   */
  function commitProfile(next: PlayerProfile): boolean {
    if (next === ctx.core.profile) return false;
    ctx.core.profile = next;
    onProfileChanged(ctx.core.profile);
    if (ctx.core.state?.mode === "docked") {
      renderStation();
    } else {
      syncEconomyProbe();
    }
    return true;
  }

  /**
   * The synchronous screen-open sink (step 7): the input layer calls this
   * inside `keyDown`, so the context switches before the same-frame next key
   * resolves. F3/F4/F5/F8 are all reachable from home and from any section.
   */
  function openStationScreen(action: ActionId): void {
    const currentState = ctx.core.state;
    const currentInput = ctx.runtime.input;
    if (currentState?.mode !== "docked" || currentInput === undefined) return;

    let screen: StationScreen | undefined;
    switch (action) {
      case "stationMarket":
        screen = "market";
        break;
      case "stationOutfitting":
        screen = "outfitting";
        break;
      case "stationStatus":
        screen = "status";
        break;
      case "stationInterfaces":
        screen = "interfaces";
        break;
      default:
        return;
    }
    if (screen === undefined) return;

    ctx.station.stationScreen = screen;
    ctx.station.outfittingFacingFor = null;
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    ctx.station.stationPage = 1;
    if (screen === "market") ensureSelection();
    if (screen === "outfitting") {
      // Opening a screen always starts at the first row with no pending line.
      ctx.station.stationSelection = "";
      ensureOutfittingSelection();
    }
    currentInput.setContext("dockScreen");
    renderStation();
  }

  function backToHome(): void {
    if (ctx.station.stationScreen === "home") return;
    ctx.station.stationScreen = "home";
    ctx.station.outfittingFacingFor = null;
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    ctx.station.stationPage = 1;
    ctx.runtime.input?.setContext("dockHome");
    renderStation();
  }

  /**
   * The one click sink of the station tab strip. It routes through the same
   * open paths the keys use, but adds the guards those paths get implicitly
   * from the input context: openStationScreen and backToHome know nothing of
   * pause, overlays or the overwrite dialog, and a DOM `disabled` attribute is
   * not a trust boundary (a button can be force-enabled from page script).
   */
  function navigateStation(tabId: StationTabId): void {
    const currentState = ctx.core.state;
    if (
      ctx.runtime.disposed ||
      ctx.runtime.contextLost ||
      ctx.runtime.paused ||
      currentState === undefined ||
      ctx.save.saveLoad?.isConfirming() === true
    ) {
      return;
    }
    const nav = currentNavState(currentState);
    if (!isTabEnabled(tabId, nav) || tabId === activeTabId(nav)) return;
    const tab = tabById(tabId);
    if (tab === undefined) return;

    if (tab.kind === "launch") {
      // The same command the Home button queues; the frame filter on the home
      // screen remains the last guard (D-03).
      pending.push({ kind: "launch" });
      return;
    }

    // Close an open overlay first: both closers restore the station input
    // context they recorded, and openSaveScreen refuses while the chart is up.
    if (ctx.chart.chartOpen) closeChart();
    if (ctx.save.saveScreenOpen) closeSaveScreen();

    if (tab.kind === "home") {
      backToHome();
    } else if (tab.kind === "screen") {
      // The screen underneath an overlay keeps its selection, page and pending
      // state: only a different screen goes through openStationScreen.
      if (tab.action !== null && tab.screen !== ctx.station.stationScreen) {
        openStationScreen(tab.action);
      }
    } else if (tab.kind === "chart") {
      openChart();
    } else if (tab.kind === "saveLoad") {
      openSaveScreen();
    }
    syncStationNav();
  }

  /**
   * The synchronous sink for the docked screen keys (F2 Save/Load, F3
   * Outfitting, F4 Interfaces, F5 Status, F6 Chart, F8 Market). The input
   * layer calls it inside `keyDown` in every context but `flight`.
   *
   * As in Oolite, the keys work from every docked screen, the chart and the F2
   * screen included (`pollDockedControls` calls `pollGuiScreenControls` on
   * every docked GUI screen, `PlayerEntityControls.m:4157-4165` at the pin
   * 7437f22): an open overlay is closed first (closing the F2 screen also
   * cancels an open overwrite dialog), then the target opens. F3 and F4
   * re-run their open path even on their own screen. F5 on Status page 1
   * with no overlay open opens the Manifest (page 2), elsewhere Status page 1
   * (`PlayerEntityControls.m:3904-3916`). F8 on the Market with no overlay
   * open does nothing, because Oolite's second F8 opens Market Info
   * (`PlayerEntityControls.m:3955-3967`) and Wegolite has none (owner decision
   * 2026-11-24, quick 261124-ou6, FIDELITY E-186), as F6 on an open chart;
   * with an overlay open F8 closes it and shows the Market. F2 on its own
   * screen is ignored, as Oolite ignores it on `GUI_SCREEN_OPTIONS`. F6 on an
   * open chart does nothing: the chart stays open with its preset and camera,
   * and Escape is the way out (owner decision 2026-11-24, FIDELITY E-184;
   * Oolite's F6 switches the short-range and the long-range chart,
   * `PlayerEntityControls.m:3921-3940`, but Wegolite has one zoomable chart
   * whose presets Tab switches).
   *
   * In flight (the chart is the only overlay there) F6 on the open chart does
   * nothing either, and every other key does nothing; during the launch
   * pre-roll the station is already behind the player, so nothing opens.
   */
  function navigateByKey(action: ActionId): void {
    const currentState = ctx.core.state;
    if (
      !STATION_NAV_ACTIONS.has(action) ||
      ctx.runtime.disposed ||
      ctx.runtime.contextLost ||
      ctx.runtime.paused ||
      ctx.runtime.gameOver ||
      currentState === undefined
    ) {
      return;
    }
    // F6 on an open chart is a no-op: never close it, never switch its preset.
    if (action === "chart" && ctx.chart.chartOpen) return;
    if (currentState.mode !== "docked" || launchSequence.preRolling) return;
    if (action === "saveLoad" && ctx.save.saveScreenOpen) return;

    // With the chart or the F2 screen open, the current GUI screen is that
    // overlay, so F5 and F8 open Status page 1 or the Market list instead of
    // their second-press behaviour.
    const overlayOpen = ctx.chart.chartOpen || ctx.save.saveScreenOpen;

    // F8 on the Market itself does nothing: Oolite's second F8 opens Market
    // Info (`PlayerEntityControls.m:3955-3967`), which Wegolite does not have
    // (owner decision 2026-11-24, quick 261124-ou6, FIDELITY E-186). Like F6 on
    // an open chart, nothing changes and nothing renders.
    if (
      !overlayOpen &&
      action === "stationMarket" &&
      ctx.station.stationScreen === "market"
    ) {
      return;
    }

    // The second press of F5 (Oolite's `pollGuiScreenControlsWithFKeyAlias`,
    // `PlayerEntityControls.m:3904-3916`) acts only when Status itself is the
    // current screen, on page 1: it opens the Manifest. Elsewhere F5 opens
    // Status page 1.
    if (
      !overlayOpen &&
      ctx.station.stationPage === 1 &&
      action === "stationStatus" &&
      ctx.station.stationScreen === "status"
    ) {
      ctx.station.stationPage = 2;
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "";
      renderStation();
      return;
    }

    if (ctx.chart.chartOpen) closeChart();
    if (ctx.save.saveScreenOpen) closeSaveScreen();

    if (action === "chart") openChart();
    else if (action === "saveLoad") openSaveScreen();
    else openStationScreen(action);
  }

  /** The Status | Manifest sub-tab: the same effect as the Tab key's paging. */
  function setStationPage(page: 1 | 2): void {
    if (
      ctx.runtime.disposed ||
      ctx.runtime.paused ||
      ctx.runtime.contextLost ||
      ctx.core.state?.mode !== "docked" ||
      ctx.station.stationScreen !== "status" ||
      ctx.chart.chartOpen ||
      ctx.save.saveScreenOpen ||
      ctx.station.stationPage === page
    ) {
      return;
    }
    ctx.station.stationPage = page;
    renderStation();
  }

  /**
   * The F8 heading-click sink (quick task 261118-cyo, owner decision
   * 2026-11-18): cycle the sort on one column and repaint. It repeats
   * `setStationPage`'s guards, because a DOM click is not a trust boundary,
   * and accepts only `MARKET_SORT_COLUMNS`. The selection and a pending
   * `[Y/N]` plan are kept: both name their commodity by key, so a reorder
   * cannot retarget them.
   */
  function sortMarket(column: MarketSortColumn): void {
    if (
      ctx.runtime.disposed ||
      ctx.runtime.paused ||
      ctx.runtime.contextLost ||
      ctx.core.state?.mode !== "docked" ||
      ctx.station.stationScreen !== "market" ||
      ctx.chart.chartOpen ||
      ctx.save.saveScreenOpen ||
      !isMarketSortColumn(column)
    ) {
      return;
    }
    ctx.station.marketSort = nextMarketSort(ctx.station.marketSort, column);
    renderStation();
  }

  /**
   * Apply one drained station action. The live mode, context and screen are
   * revalidated here, so a queued action cannot apply a stale trade after a
   * screen change, a dock or a pause.
   */
  function applyStationAction(action: ActionId): void {
    const currentState = ctx.core.state;
    const currentInput = ctx.runtime.input;
    if (currentState?.mode !== "docked" || currentInput === undefined) return;
    if (ctx.runtime.paused) return;
    const contexts = ACTION_CONTEXTS[action];
    if (!contexts.includes(currentInput.getContext())) return;

    switch (action) {
      case "stationBack":
        if (
          ctx.station.stationScreen === "outfitting" &&
          ctx.station.outfittingFacingFor !== null
        ) {
          closeFacingSelection();
        } else {
          backToHome();
        }
        break;
      case "stationUp":
        if (ctx.station.stationScreen === "market") {
          moveSelection(-1);
          renderStation();
        } else if (ctx.station.stationScreen === "outfitting") {
          moveOutfittingSelection(-1);
          renderStation();
        }
        break;
      case "stationDown":
        if (ctx.station.stationScreen === "market") {
          moveSelection(1);
          renderStation();
        } else if (ctx.station.stationScreen === "outfitting") {
          moveOutfittingSelection(1);
          renderStation();
        }
        break;
      case "stationRight":
        stepAmount(1);
        break;
      case "stationLeft":
        stepAmount(-1);
        break;
      case "stationBuyMax":
        planMax("buy");
        break;
      case "stationSellMax":
        planMax("sell");
        break;
      case "stationConfirm":
        if (ctx.station.stationScreen === "market") confirmTrade();
        else if (ctx.station.stationScreen === "outfitting") confirmFit();
        break;
      case "stationCancel":
        cancelTrade();
        break;
      case "stationPageNext":
        if (ctx.station.stationScreen === "status") {
          ctx.station.stationPage = 2;
          renderStation();
        }
        break;
      case "stationPagePrevious":
        if (ctx.station.stationScreen === "status") {
          ctx.station.stationPage = 1;
          renderStation();
        }
        break;
      default:
        break;
    }
  }

  return {
    isSelectableGood,
    ensureSelection,
    selectableKeys,
    moveSelection,
    equipmentSet,
    fitContext,
    laserFitContext,
    outfittingModel,
    closeFacingSelection,
    ensureOutfittingSelection,
    moveOutfittingSelection,
    commodityFor,
    pendingPlan,
    tradeRequest,
    planFor,
    stepAmount,
    planMax,
    confirmTrade,
    confirmFit,
    cancelTrade,
    currentNavState,
    syncHeaderCredits,
    syncStationNav,
    refreshStationChrome,
    renderStation,
    commitProfile,
    openStationScreen,
    backToHome,
    navigateStation,
    navigateByKey,
    setStationPage,
    sortMarket,
    applyStationAction,
  };
}

/** The station controller's public surface, derived from the factory. */
export type StationController = ReturnType<typeof createStationController>;
