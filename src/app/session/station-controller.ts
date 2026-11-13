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

import type { Commodity, System } from "../../content/types.js";
import type { ActionId } from "../../input/actions.js";
import { ACTION_CONTEXTS, DEFAULT_BINDINGS } from "../../input/actions.js";
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
import {
  FUEL_CAPACITY,
  MAX_MISSILES,
  applyFit,
  checkFit,
} from "../../sim/player/outfitting.js";
import type { FitContext } from "../../sim/player/outfitting.js";
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
  tradeNoticeText,
} from "../../ui/station-model.js";
import type { OutfittingModel } from "../../ui/station-model.js";
import { activeTabId, isTabEnabled, tabById } from "../../ui/station-tabs.js";
import type { StationNavState, StationTabId } from "../../ui/station-tabs.js";
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
    const first = currentMarket.goods.find((good) =>
      isSelectableGood(good.key, good.stock),
    );
    ctx.station.stationSelection = first?.key ?? "";
  }

  function selectableKeys(): readonly string[] {
    const currentMarket = ctx.core.market;
    if (currentMarket === undefined) return [];
    return currentMarket.goods
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

  function outfittingModel(): OutfittingModel | undefined {
    const catalogue = ctx.core.equipmentCatalogue;
    if (catalogue === undefined) return undefined;
    return buildOutfittingModel(
      catalogue,
      ctx.core.profile,
      ctx.core.system.techLevelRaw,
      ctx.station.stationSelection,
      ctx.core.commodityUnits,
    );
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
   * reaches `applyFit`. After a committed removal the row is gone, so the
   * selection clamps to the nearest surviving row and a further Y only re-opens
   * the guard (or lands on a disabled row) — it can never buy the next row.
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
    const item = catalogue.find((entry) => entry.key === key);
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
    if (pendingFit === null) {
      ctx.station.stationPending = { kind: "fit", key };
      ctx.station.stationNotice = "";
      renderStation();
      return;
    }

    const indexBefore =
      model?.rows.findIndex((entry) => entry.key === key) ?? -1;
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

  function cancelTrade(): void {
    ctx.station.stationPending = null;
    ctx.station.stationNotice = "";
    renderStation();
  }

  /** The tab strip's inputs: the base station screen plus the overlay flag. */
  function currentNavState(currentState: FlightState): StationNavState {
    return {
      mode: currentState.mode,
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
        confirmText = `Buy ${row.name} for ${formatDecicredits(row.cost)}? [Y/N]`;
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
   */
  function commitProfile(next: PlayerProfile): boolean {
    if (next === ctx.core.profile) return false;
    ctx.core.profile = next;
    onProfileChanged(ctx.core.profile);
    renderStation();
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
        backToHome();
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
    outfittingModel,
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
    setStationPage,
    applyStationAction,
  };
}

/** The station controller's public surface, derived from the factory. */
export type StationController = ReturnType<typeof createStationController>;
