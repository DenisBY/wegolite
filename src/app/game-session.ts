// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The composition root (Pattern 2, FLGT-07).
 *
 * This is the only module that wires the simulation, the scene, the HUD, the
 * input source and the UI together. It owns the single `FlightState`, samples
 * input once per rendered frame, runs whole fixed steps, and reads the state
 * once per rendered frame for the HUD and the probe.
 *
 * Boot order matters (T-3-02): both GLBs are awaited before the first frame. On
 * a rejected load the session publishes a failure and returns without
 * scheduling a frame — never a live canvas over an empty scene.
 */

import * as THREE from "three";
import { showBootFailure } from "./boot-failure.js";
import {
  loadShipCatalogue,
  playerShip,
  stationShip,
} from "../content/ships.js";
import { loadDockPort } from "../content/dock-port.js";
import { loadEquipment } from "../content/equipment.js";
import { loadCommodities } from "../content/commodities.js";
import { loadLabels } from "../content/labels.js";
import type {
  Commodity,
  CommodityUnit,
  Equipment,
  Labels,
  ShipDef,
  System,
} from "../content/types.js";
import {
  createDockFeedback,
  shouldEmitScrapeMessage,
} from "./dock-feedback.js";
import type { DockFeedback } from "./dock-feedback.js";
import { buildHudModel } from "./hud-model.js";
import { createGameLoop } from "./game-loop.js";
import type { GameLoop } from "./game-loop.js";
import { createTestHook, publishFailure, readMemory } from "./probe.js";
import type {
  WegoliteHyperspaceLastJump,
  WegoliteLastTradeProbe,
  WegoliteProbe,
  WegoliteSaveProbe,
} from "./probe.js";
import type { SceneManager } from "./scene-manager.js";
import { createHintController } from "./hints.js";
import type { HintContext, HintController } from "./hints.js";
import { createLaunchSequence } from "./launch-sequence.js";
import type { LaunchSequence } from "./launch-sequence.js";
import type { AssetCache } from "../render/asset-cache.js";
import {
  queueAutosave,
  profileFromSave,
  restoreFromSave,
  snapshotForSave,
} from "../persistence/autosave.js";
import { parseSave } from "../persistence/save.js";
import type {
  SaveAllowLists,
  SaveInputs,
  SaveParseFailure,
  SaveV2,
} from "../persistence/save.js";
import type { SaveStore, SaveStatus } from "../persistence/store.js";
import { createBreakPattern } from "../render/break-pattern.js";
import type { BreakPattern } from "../render/break-pattern.js";
import { createHud } from "../render/hud/hud.js";
import type { Hud } from "../render/hud/hud.js";
import type { HudModel } from "../render/hud/draw.js";
import { createMessageQueue } from "../render/hud/messages.js";
import {
  computeCockpitCamera,
  computeLaunchCamera,
} from "../render/launch-camera.js";
import type { CameraPose } from "../render/launch-camera.js";
import {
  applyFrame,
  applyStationRoll,
  interpolatePose,
  maxRelativeMagnitude,
} from "../render/sync.js";
import type { SystemScene } from "../render/system-scene.js";
import type { Command } from "../sim/commands.js";
import type { SimEvent } from "../sim/events.js";
import { createDockGeometry } from "../sim/dock/geometry.js";
import type { DockGeometry } from "../sim/dock/geometry.js";
import { deriveFlightConfig } from "../sim/flight/config.js";
import type { FlightConfig } from "../sim/flight/config.js";
import {
  PlayerController,
  ScriptedLaunchController,
  flightView,
} from "../sim/flight/controller.js";
import { initFlightState, poseOf } from "../sim/flight/state.js";
import type { FlightPose, FlightState } from "../sim/flight/state.js";
import { stepFlight } from "../sim/flight/step.js";
import type { StepOptions } from "../sim/flight/step.js";
import {
  MAX_EQUIPMENT_KEYS,
  formatDecicredits,
  newProfile,
  setCredits,
} from "../sim/player/profile.js";
import type { PlayerProfile } from "../sim/player/profile.js";
import {
  arrivalMarketSeed,
  generateMarket,
  marketSeedForSystem,
} from "../sim/economy/market.js";
import type { Market } from "../sim/economy/market.js";
import { applyWitchpointArrival } from "../sim/hyperspace/arrival.js";
import { countdownSecondsRemaining } from "../sim/hyperspace/countdown.js";
import type { HyperspaceRefusal } from "../sim/events.js";
import {
  availablePods,
  capacityPodsFor,
  holdPodsUsed,
} from "../sim/economy/cargo.js";
import {
  applyBuy,
  applySell,
  planBuy,
  planSell,
} from "../sim/economy/trade.js";
import type { TradePlan, TradeSide } from "../sim/economy/trade.js";
import {
  FUEL_CAPACITY,
  MAX_MISSILES,
  applyFit,
  checkFit,
} from "../sim/player/outfitting.js";
import type { FitContext } from "../sim/player/outfitting.js";
import { formatFuel } from "../ui/docked.js";
import { createChart } from "../ui/chart.js";
import type { ChartOverlay } from "../ui/chart.js";
import { createSaveLoadScreen } from "../ui/save-load.js";
import type { SaveLoadScreen } from "../ui/save-load.js";
import { formatClock } from "../render/hud/format.js";
import { buildChartView, nearestInDirection } from "../ui/chart-model.js";
import type { ChartRange, ChartView } from "../ui/chart-model.js";
import {
  buildMarketModel,
  buildOutfittingModel,
  buildStatusModel,
  buildSystemDataModel,
  isMarketRowSelectable,
  tradeNoticeText,
} from "../ui/station-model.js";
import type { OutfittingModel } from "../ui/station-model.js";
import { identity, sub, vec } from "../sim/math.js";
import type { Vec3 } from "../sim/math.js";
import type { InputFrame } from "../sim/state.js";
import { DT } from "../sim/time.js";
import { deriveSystemLayout } from "../sim/world/layout.js";
import type { SystemLayout } from "../sim/world/layout.js";
import { createKeyboardInputSource } from "../input/keyboard.js";
import type { KeyboardInputSource } from "../input/keyboard.js";
import { ACTION_CONTEXTS, ACTION_IDS } from "../input/actions.js";
import type { ActionId, InputContext } from "../input/actions.js";
import { createBindingMap } from "../input/bindings.js";
import type { BindingMap } from "../input/bindings.js";
import {
  loadSettings,
  resetSettings,
  saveSettings,
} from "../settings/store.js";
import type { SettingsV1 } from "../settings/schema.js";
import { createControlsPanel } from "../ui/controls.js";
import type { ControlsPanel } from "../ui/controls.js";
import { createPauseOverlay } from "../ui/pause.js";
import type { PauseOverlay } from "../ui/pause.js";
import { createSettingsPanel } from "../ui/settings-panel.js";
import type { SettingsPanel } from "../ui/settings-panel.js";
import type {
  StationScreen,
  StationShell,
  StationView,
} from "../ui/station.js";
import type { TitleScreen } from "../ui/title.js";

/** A station transaction awaiting confirmation; plan 05-03 adds fit prompts. */
export type FitPrompt = { readonly kind: "fit"; readonly key: string };

export type StationPending = TradePlan | FitPrompt | null;

export interface GameSessionSave {
  /** The injected port; the session never imports IndexedDB directly. */
  readonly store: SaveStore;
  /** The status boot derived from the one read; `future`/`unreadable` stop all writes. */
  readonly status: SaveStatus;
  /** The validated save, present only when `status` is `valid`. */
  readonly save?: SaveV2;
  /** The boot allow-lists the writer's semantic check uses (T-05-19). */
  readonly allow: SaveAllowLists;
}

export interface StartOptions {
  /** New game is the default; a restore is Continue. */
  readonly fresh?: boolean;
  /** A validated blob to restore instead of starting at Lave. */
  readonly restore?: SaveV2;
}

export interface GameSessionOptions {
  readonly renderer: THREE.WebGLRenderer;
  readonly assets: AssetCache;
  readonly scenes: SceneManager;
  readonly title: TitleScreen;
  readonly docked: StationShell;
  readonly hudCanvas: HTMLCanvasElement;
  readonly probe: WegoliteProbe;
  readonly system: System;
  /**
   * The validated galaxy catalogue (plan 06-04). Every target id resolves
   * through this map; the chart plots the same records. Defaults to the boot
   * system alone, which keeps a probe/unit harness working without content.
   */
  readonly galaxy?: readonly System[];
  readonly pauseRoot: HTMLElement;
  readonly controlsRoot: HTMLElement;
  readonly settingsRoot: HTMLElement;
  /** The canvas that receives focus when the pause overlay closes. */
  readonly gameRoot: HTMLElement;
  /** DOCK-07: the boot read and the store every autosave writes through. */
  readonly save: GameSessionSave;
  /**
   * Plan 04-05 attaches the purchase autosave here. Called after every accepted
   * profile change (purchase or dev-seam grant), so a reload cannot silently
   * undo it without re-opening the panel code.
   */
  readonly onProfileChanged?: (profile: PlayerProfile) => void;
}

export interface GameSession {
  /**
   * Load the assets, build the Lave scene and start the render loop. A restore
   * resumes the validated docked save; the default starts a New game and clears
   * this build's save first.
   */
  start(options?: StartOptions): Promise<void>;
  /** The HUD needs the same resize as the WebGL canvas. */
  resize(): void;
  /** Freeze the simulation and show the pause overlay (D-14/D-15). */
  pause(): void;
  /** Resume from pause and discard any hidden time (D-14). */
  resume(): void;
  isPaused(): boolean;
  /** Clear every held key without changing the paused flag (focus loss). */
  clearInput(): void;
  dispose(): void;
}

function toTuple(position: Vec3): [number, number, number] {
  return [position.x, position.y, position.z];
}

export function createGameSession(options: GameSessionOptions): GameSession {
  const {
    renderer,
    assets,
    scenes,
    title,
    docked,
    hudCanvas,
    probe,
    pauseRoot,
    controlsRoot,
    settingsRoot,
    gameRoot,
    save: saveBoot,
    onProfileChanged = () => undefined,
  } = options;

  // D-01: the system is mutable once a jump can install a new scene.
  let system = options.system;
  const galaxy = options.galaxy ?? [options.system];
  const galaxyById = new Map<string, System>();

  const player = new PlayerController();
  const scripted = new ScriptedLaunchController();
  const pending: Command[] = [];
  const uiController = new AbortController();

  let state: FlightState | undefined;
  let layout: SystemLayout | undefined;
  let config: FlightConfig | undefined;
  let dockGeometry: DockGeometry | undefined;
  let scene: SystemScene | undefined;
  let stationDef: ShipDef | undefined;
  let hud: Hud | undefined;
  let breakPattern: BreakPattern | undefined;
  let input: KeyboardInputSource | undefined;
  let loop: GameLoop | undefined;
  let settings: SettingsV1 | undefined;
  let bindings: BindingMap | undefined;
  let hints: HintController | undefined;
  let pauseOverlay: PauseOverlay | undefined;
  let controlsPanel: ControlsPanel | undefined;
  let settingsPanel: SettingsPanel | undefined;
  let equipmentCatalogue: readonly Equipment[] | undefined;
  let commodities: readonly Commodity[] | undefined;
  let labels: Labels | undefined;
  let commodityUnits: ReadonlyMap<string, CommodityUnit> = new Map();
  let stationKey: string | undefined;
  // Economy state lives beside the flight state, never inside it (D-10).
  let profile: PlayerProfile = newProfile();
  let lastDockClockDelta = 0;

  // Market lifetime (D-17/D-18/D-19): generated once from the persisted seed,
  // never regenerated on a `docked` event. Phase 6 owns re-seeding on a system change.
  let market: Market | undefined;
  let marketSeed: number | undefined;

  // The station computer's own state; the UI is purely presentational.
  let stationScreen: StationScreen = "home";
  let stationSelection = "";
  let stationPending: StationPending = null;
  let stationNotice = "";
  let stationMessage = "";
  let stationSaveNotice = "";
  let stationPage: 1 | 2 = 1;
  let lastTrade: WegoliteLastTradeProbe | null = null;

  // Navigation state (D-01/D-02/D-06). The chart freezes the loop rather than
  // pausing it; the committed target is session state and travels in every save.
  let chart: ChartOverlay | undefined;
  let chartOpen = false;
  let chartRange: ChartRange = "short";
  let chartSelectedId: string | undefined;
  let hyperspaceTargetId: string | undefined;
  let contextBeforeChart: InputContext = "flight";
  let lastJump: WegoliteHyperspaceLastJump | null = null;
  let lastRefusal: { reason: HyperspaceRefusal } | null = null;

  // The F2 Save/Load screen (D-20..D-23). It is a standalone overlay with its
  // own input context; F2 is docked-only and never opens beneath pause/chart.
  let saveLoad: SaveLoadScreen | undefined;
  let saveScreenOpen = false;
  let contextBeforeSaveScreen: InputContext = "dockHome";
  let saveScreenNotice = "";

  // DOCK-07: the boot status is sticky for the session. A future blob is never
  // cleared or overwritten, so the launch/purchase write path is skipped whole.
  let saveStatus: SaveStatus = saveBoot.status;
  let saveRevision = 0;
  let saveAttempts = 0;
  let saveWrites = 0;
  let saveCommitted = 0;
  let saveCommittedRevision = 0;
  let saveLastClock: number | null = null;
  let saveSkipReason = statusSkipReason(saveStatus);
  let saveUnavailable = saveStatus === "unavailable";
  // A manual Save is a single confirmed request; the flag coalesces a
  // double-press while the one write is in flight.
  let manualSavePending = false;
  let loadingSave = false;
  const saveProbe: WegoliteSaveProbe = {
    status: saveStatus,
    attempts: 0,
    writes: 0,
    committed: 0,
    revision: 0,
    lastClock: null,
    continueVisible: false,
    skipReason: saveSkipReason,
    unavailable: saveUnavailable,
  };
  probe.save = saveProbe;

  let previousPose: FlightPose = {
    position: vec(0, 0, 0),
    orientation: identity(),
  };
  let currentPose: FlightPose = previousPose;
  let previousCameraWorld: Vec3 | undefined;
  let currentFrame: InputFrame = {
    pitch: 0,
    roll: 0,
    speed: 0,
    precision: false,
  };
  let paused = false;
  let launchSeen = false;
  // Set by any accepted `?test=1` live-state mutation; plan 04-05 refuses to
  // autosave a tainted profile.
  let testTainted = false;
  let lastScrapeMessageTime: number | null = null;
  const messages = createMessageQueue(4);
  const dockFeedback: DockFeedback = createDockFeedback();
  const launchSequence: LaunchSequence = createLaunchSequence();
  let lastModel: HudModel | undefined;
  let lastMs = 0;
  let rafId = 0;
  let disposed = false;
  // Set synchronously on the first `start()` call. `state` is only assigned
  // after two awaits, so it cannot guard re-entry on its own.
  let starting = false;

  function persistSettings(): void {
    if (settings === undefined || bindings === undefined) return;
    settings.bindings = bindings;
    saveSettings(settings);
  }

  /** D-08 copy is app-owned and fixed; the sim event carries facts only. */
  function bounceMessage(event: {
    cause: "hull" | "straddle";
    axis: "x" | "y" | "z";
  }): string {
    if (event.cause === "straddle") {
      return "Too wide for the slot - roll 90 degrees to match the opening";
    }
    if (event.axis === "x") {
      return "Hull contact - roll 90 degrees and line up with the slot";
    }
    return "Hull contact - pull away and line up with the slot";
  }

  /**
   * A market row is reachable when it can be bought **or** when the hold
   * carries some of it. A zero-stock row you hold is dimmed but still
   * selectable, or the canonical run (sell Computers at a Lave with no stock)
   * would be unreachable.
   */
  function isSelectableGood(key: string, stock: number): boolean {
    const catalogue = commodities;
    if (catalogue === undefined) return false;
    const commodity = catalogue.find((entry) => entry.key === key);
    if (commodity === undefined) return false;
    return isMarketRowSelectable(
      commodity.tradeable,
      stock,
      profile.cargo[key] ?? 0,
    );
  }

  /** The first commodity a player can actually trade in this market. */
  function ensureSelection(): void {
    const currentMarket = market;
    if (currentMarket === undefined) return;
    const selectedGood = currentMarket.goods.find(
      (good) => good.key === stationSelection,
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
    stationSelection = first?.key ?? "";
  }

  function selectableKeys(): readonly string[] {
    const currentMarket = market;
    if (currentMarket === undefined) return [];
    return currentMarket.goods
      .filter((good) => isSelectableGood(good.key, good.stock))
      .map((good) => good.key);
  }

  function moveSelection(delta: number): void {
    const keys = selectableKeys();
    if (keys.length === 0) return;
    const current = keys.indexOf(stationSelection);
    const base = current === -1 ? 0 : current;
    const next = (base + delta + keys.length) % keys.length;
    const nextKey = keys[next];
    if (nextKey !== undefined) stationSelection = nextKey;
    stationPending = null;
    stationNotice = "";
  }

  /** The live FitContext; every field is derived from the validated profile. */
  function fitContext(): FitContext | undefined {
    const catalogue = equipmentCatalogue;
    const missile = catalogue?.find((entry) => entry.key === "EQ_MISSILE");
    if (missile === undefined) return undefined;
    return {
      techLevelRaw: system.techLevelRaw,
      fuelCapacity: FUEL_CAPACITY,
      missileCapacity: MAX_MISSILES,
      availablePods: availablePods(profile, commodityUnits),
      missilePrice: missile.price,
    };
  }

  function outfittingModel(): OutfittingModel | undefined {
    const catalogue = equipmentCatalogue;
    if (catalogue === undefined) return undefined;
    return buildOutfittingModel(
      catalogue,
      profile,
      system.techLevelRaw,
      stationSelection,
      commodityUnits,
    );
  }

  /** Reset F3 to its first visible row (and clear its pending confirmation). */
  function ensureOutfittingSelection(): void {
    const model = outfittingModel();
    if (model === undefined) {
      stationSelection = "";
      return;
    }
    if (!model.rows.some((row) => row.key === stationSelection)) {
      stationSelection = model.rows[0]?.key ?? "";
    }
  }

  /** Up/Down on F3; the list clamps at both ends and never wraps. */
  function moveOutfittingSelection(delta: number): void {
    const model = outfittingModel();
    if (model === undefined || model.rows.length === 0) return;
    let index = model.rows.findIndex((row) => row.key === stationSelection);
    if (index === -1) index = 0;
    const next = Math.min(model.rows.length - 1, Math.max(0, index + delta));
    const row = model.rows[next];
    if (row !== undefined) stationSelection = row.key;
    stationPending = null;
    stationNotice = "";
  }

  /** The blunt refusal copy; a clamped plan's notice comes from the view model. */
  function commodityFor(key: string): Commodity | undefined {
    return commodities?.find((entry) => entry.key === key);
  }

  function pendingPlan(): TradePlan | null {
    return stationPending !== null && !("kind" in stationPending)
      ? stationPending
      : null;
  }

  /**
   * The plain-data request both plans read. `units` is ignored by `planSell`
   * and required by `planBuy`, so one builder serves both.
   */
  function tradeRequest(amount: number) {
    const currentMarket = market;
    const catalogue = commodities;
    const commodity = catalogue?.find(
      (entry) => entry.key === stationSelection,
    );
    if (currentMarket === undefined || commodity === undefined)
      return undefined;
    return {
      market: currentMarket,
      profile,
      commodity,
      units: commodityUnits,
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
    if (stationScreen !== "market") return;
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
      stationPending = null;
      stationNotice = "";
      renderStation();
      return;
    }

    const plan = planFor(side, amount);
    if (plan === undefined) return;
    if (plan.ok) {
      stationPending = plan;
      // A clamp's copy is derived by the view model from the plan itself.
      stationNotice = "";
    } else {
      stationPending = null;
      stationNotice = tradeNoticeText(plan, commodityFor(plan.key));
    }
    renderStation();
  }

  /**
   * Shift+arrow: plan the largest feasible trade. The request is "as much as
   * possible", so a feasible plan carries no clamp — only a zero-feasible plan
   * has a reason to state.
   */
  function planMax(side: TradeSide): void {
    if (stationScreen !== "market") return;
    const plan = planFor(side, Number.MAX_SAFE_INTEGER);
    if (plan === undefined) return;
    if (plan.ok) {
      stationPending = { ...plan, clamp: undefined };
      stationNotice = "";
    } else {
      stationPending = null;
      stationNotice = tradeNoticeText(plan, commodityFor(plan.key));
    }
    renderStation();
  }

  function confirmTrade(): void {
    if (stationScreen !== "market") return;
    const plan = pendingPlan();
    if (plan === null) return;
    const request = tradeRequest(plan.amount);
    if (request === undefined) return;

    const applied =
      plan.side === "buy" ? applyBuy(request, plan) : applySell(request, plan);
    if (applied === undefined) {
      stationPending = null;
      stationNotice = "That trade is no longer available";
      renderStation();
      return;
    }
    market = applied.market;
    stationPending = null;
    stationNotice = "";
    lastTrade = {
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
    if (stationScreen !== "outfitting") return;
    const catalogue = equipmentCatalogue;
    const ctx = fitContext();
    if (catalogue === undefined || ctx === undefined) return;

    const pendingFit =
      stationPending !== null && "kind" in stationPending
        ? stationPending
        : null;
    const key = pendingFit?.key ?? stationSelection;
    const model = outfittingModel();
    const item = catalogue.find((entry) => entry.key === key);
    const row = model?.rows.find((entry) => entry.key === key);
    if (item === undefined || row === undefined) {
      stationPending = null;
      stationNotice = "Not offered";
      renderStation();
      return;
    }
    if (!row.confirmable) {
      stationPending = null;
      stationNotice = row.reason;
      renderStation();
      return;
    }
    if (pendingFit === null) {
      stationPending = { kind: "fit", key };
      stationNotice = "";
      renderStation();
      return;
    }

    const indexBefore =
      model?.rows.findIndex((entry) => entry.key === key) ?? -1;
    const check = checkFit(profile, item, ctx);
    if (!check.ok) {
      stationPending = null;
      stationNotice = row.reason;
      renderStation();
      return;
    }
    const next = applyFit(profile, item, ctx);
    if (next === profile) {
      stationPending = null;
      stationNotice = row.reason;
      renderStation();
      return;
    }
    stationPending = null;
    stationNotice = "";
    lastTrade = {
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
      !after.rows.some((entry) => entry.key === stationSelection)
    ) {
      const fallback = after.rows[Math.min(indexBefore, after.rows.length - 1)];
      stationSelection = fallback?.key ?? "";
    }
    renderStation();
  }

  function cancelTrade(): void {
    stationPending = null;
    stationNotice = "";
    renderStation();
  }

  /** Keys/messages for the persistent footer, one field per concern. */
  function keyHints(screen: StationScreen): string {
    if (screen === "market") {
      return "Up/Down select · Right buys +1 · Left sells +1 · Shift max · Y confirm · N cancel · Esc back · P pause";
    }
    if (screen === "outfitting") {
      return "Up/Down select · Y confirm · N cancel · Esc back · F8 market · F5 status · F7 system data · P pause";
    }
    if (screen === "status") {
      return "Tab/PageDown next page · PageUp previous · Esc back · F8 market · F3 outfitting · F7 system data · P pause";
    }
    if (screen === "systemData") {
      return "Esc back · F8 market · F3 outfitting · F5 status · P pause";
    }
    return "F8 market · F3 outfitting · F5 status · F7 system data · 1 launch · P pause";
  }

  function renderStation(): void {
    const currentMarket = market;
    const catalogue = commodities;
    if (currentMarket === undefined || catalogue === undefined) return;

    const equipment = equipmentCatalogue;
    const marketModel = buildMarketModel(
      currentMarket,
      profile,
      catalogue,
      stationSelection,
      { pending: pendingPlan(), notice: stationNotice },
    );
    const outModel =
      equipment === undefined
        ? undefined
        : buildOutfittingModel(
            equipment,
            profile,
            system.techLevelRaw,
            stationSelection,
            commodityUnits,
          );
    const statusModel =
      labels === undefined || equipment === undefined
        ? undefined
        : buildStatusModel(
            profile,
            system,
            labels,
            equipment,
            catalogue,
            stationPage,
            targetSystem()?.name,
          );
    const systemModel =
      labels === undefined ? undefined : buildSystemDataModel(system, labels);

    let confirmText = "";
    let noticeText = stationNotice;
    if (stationScreen === "market") {
      confirmText = marketModel.confirmText ?? "";
      noticeText = marketModel.noticeText;
    } else if (stationScreen === "outfitting") {
      const pendingFit =
        stationPending !== null && "kind" in stationPending
          ? stationPending
          : null;
      const row = outModel?.rows.find(
        (entry) => entry.key === (pendingFit?.key ?? stationSelection),
      );
      if (pendingFit !== null && row !== undefined) {
        confirmText = `Buy ${row.name} for ${formatDecicredits(row.cost)}? [Y/N]`;
      }
    }

    const saveText = canOverwrite(saveStatus)
      ? stationSaveNotice
      : "Saving is disabled — this save is read-only";

    const view: StationView = {
      screen: stationScreen,
      systemName: system.name,
      creditsText: formatDecicredits(profile.credits),
      fuelText: formatFuel(profile.fuel),
      message: stationMessage,
      keysText: keyHints(stationScreen),
      confirmText,
      noticeText,
      saveText,
      market: marketModel,
      outfitting: outModel,
      status: statusModel,
      systemData: systemModel,
    };
    docked.setFuel(formatFuel(profile.fuel));
    docked.render(view);
    syncEconomyProbe();
  }

  function syncEconomyProbe(): void {
    const currentMarket = market;
    if (currentMarket === undefined || marketSeed === undefined) return;
    const pendingProbe =
      stationPending === null
        ? null
        : "kind" in stationPending
          ? { kind: "fit" as const, key: stationPending.key }
          : { kind: "trade" as const, key: stationPending.key };
    probe.economy = {
      credits: profile.credits,
      cargo: { ...profile.cargo },
      marketSeed,
      marketSystemId: currentMarket.systemId,
      market: currentMarket.goods.map((good) => ({
        key: good.key,
        price: good.price,
        stock: good.stock,
      })),
      fuel: profile.fuel,
      missiles: profile.missiles,
      passengerBerths: profile.passengerBerths,
      holdPods: holdPodsUsed(profile.cargo, commodityUnits),
      capacityPods: capacityPodsFor(profile.equipment, profile.passengerBerths),
      lastTrade,
    };
    probe.station = {
      open: state?.mode === "docked",
      screen: stationScreen,
      selectedKey: stationSelection,
      page: stationPage,
      pending: pendingProbe,
      message: stationMessage,
    };
  }

  /**
   * Commit an accepted profile change: publish it to the 04-05 seam, then
   * refresh the station header/market. A refusal returns `false` and changes
   * nothing.
   */
  function commitProfile(next: PlayerProfile): boolean {
    if (next === profile) return false;
    profile = next;
    onProfileChanged(profile);
    renderStation();
    return true;
  }

  /** `?test=1` seam: replace the balance; never persisted by the hook itself. */
  function applyTestCredits(credits: number): boolean {
    return commitProfile(setCredits(profile, credits));
  }

  /** `?test=1` seam: grant only a key the validated catalogue knows. */
  function applyTestEquipment(key: string): boolean {
    const catalogue = equipmentCatalogue;
    if (catalogue === undefined) return false;
    if (catalogue.every((item) => item.key !== key)) return false;
    if (profile.equipment.includes(key)) return false;
    if (profile.equipment.length >= MAX_EQUIPMENT_KEYS) return false;
    return commitProfile({
      ...profile,
      equipment: [...profile.equipment, key],
    });
  }

  function syncSaveProbe(): void {
    saveProbe.status = saveStatus;
    saveProbe.attempts = saveAttempts;
    saveProbe.writes = saveWrites;
    saveProbe.committed = saveCommitted;
    // D-23: the probe reports the last COMMITTED revision, never the one a
    // queued write merely requested.
    saveProbe.revision = saveCommittedRevision;
    saveProbe.lastClock = saveLastClock;
    saveProbe.skipReason = saveSkipReason;
    saveProbe.unavailable = saveUnavailable;
    saveProbe.notice = saveScreenNotice;
  }

  function isStoreUnavailable(reason: string | undefined): boolean {
    return (
      reason === "unavailable" ||
      reason === "version" ||
      reason === "blocked" ||
      reason === "disposed"
    );
  }

  /**
   * Only a blob this build positively owns may be replaced. `unavailable` (the
   * read failed or the database would not open) and `unreadable` are
   * untouchable: the writer must never overwrite something it could not read.
   */
  function canOverwrite(status: SaveStatus): boolean {
    return status === "absent" || status === "valid";
  }

  /**
   * Only a blob this build positively understands may be deleted. A corrupt
   * v1-shaped blob is eligible (boot already copied it aside); `future`,
   * `unreadable` and `unavailable` are not.
   */
  function canClear(status: SaveStatus): boolean {
    return status === "absent" || status === "valid" || status === "corrupt";
  }

  /** The probe's short reason for a skipped autosave or clear. */
  function statusSkipReason(status: SaveStatus): string {
    if (status === "future") return "future";
    if (status === "unreadable") return "unreadable";
    if (status === "unavailable") return "unavailable";
    // A corrupt blob is recognised but not overwritable (`canOverwrite`), so
    // its reason must be visible rather than silently blank.
    if (status === "corrupt") return "corrupt";
    return "";
  }

  /** Publish one app-owned save notice on the F2 screen and station footer. */
  function setSaveNotice(text: string): void {
    saveScreenNotice = text;
    stationSaveNotice = text;
    saveLoad?.setNotice(text);
    syncSaveProbe();
  }

  /**
   * Build the one schema input set used by both the autosave anchors and the
   * manual F2 Save, so the two producers can never diverge (D-21).
   */
  function buildSnapshotInputs(): SaveInputs | undefined {
    const currentState = state;
    const currentStationKey = stationKey;
    const currentMarket = market;
    const catalogue = commodities;
    if (
      currentState === undefined ||
      currentStationKey === undefined ||
      currentMarket === undefined ||
      catalogue === undefined
    ) {
      return undefined;
    }
    return snapshotForSave(
      currentState,
      profile,
      system,
      { key: currentStationKey },
      currentMarket,
      catalogue,
      hyperspaceTargetId,
    );
  }

  /**
   * Encode and queue one snapshot on the one serialized revision queue. The
   * probe only publishes a committed revision, clock and notice when the
   * transaction completes.
   */
  function queueSnapshot(inputs: SaveInputs, manual: boolean): void {
    saveRevision += 1;
    const revision = saveRevision;
    saveWrites += 1;
    saveSkipReason = "";
    syncSaveProbe();
    // The frame loop never awaits this; `queueAutosave` cannot reject.
    void queueAutosave(saveBoot.store, revision, inputs, saveBoot.allow).then(
      (result) => {
        if (manual) manualSavePending = false;
        if (result.committed) {
          saveCommitted += 1;
          saveCommittedRevision = revision;
          saveLastClock = inputs.clockSeconds;
          saveStatus = "valid";
          saveSkipReason = "";
          if (manual) {
            setSaveNotice(`Saved at ${formatClock(inputs.clockSeconds)}`);
          } else {
            stationSaveNotice = "";
          }
        } else if (isStoreUnavailable(result.reason)) {
          saveUnavailable = true;
          saveSkipReason = result.reason ?? "";
          if (manual) setSaveNotice("Save failed — progress not saved");
          else stationSaveNotice = "Save failed — progress not saved";
        } else {
          // A rejected snapshot (invalid-save) or a store failure is visible
          // but non-blocking: the in-memory session remains playable.
          saveSkipReason = result.reason ?? "";
          if (manual) setSaveNotice("Save failed — progress not saved");
          else stationSaveNotice = "Save failed — progress not saved";
        }
        syncSaveProbe();
        if (!disposed) {
          renderStation();
          if (saveScreenOpen) saveLoad?.setSlot(saveSlotText());
        }
      },
    );
  }

  /**
   * DOCK-07: a write can only follow a launch or a purchase. A future,
   * unreadable or unavailable blob leaves the write path disabled for the whole
   * session; a tainted profile (any `?test=1` mutation) must never become
   * durable. Every skip is visible in the probe.
   */
  function autosave(): void {
    // WR-03: recorded before every skip, so a test can prove that a dock never
    // even reached this function while the taint guard still suppresses writes.
    saveAttempts += 1;
    if (!canOverwrite(saveStatus)) {
      saveSkipReason = statusSkipReason(saveStatus);
      syncSaveProbe();
      return;
    }
    if (testTainted) {
      saveSkipReason = "tainted";
      syncSaveProbe();
      return;
    }
    const inputs = buildSnapshotInputs();
    if (inputs === undefined) {
      saveSkipReason = "not-ready";
      syncSaveProbe();
      return;
    }
    queueSnapshot(inputs, false);
  }

  /**
   * D-21: the manual Save writes the one `autosave` key through the same
   * `snapshotForSave` + `queueAutosave` path. A committed valid slot asks first;
   * only absent/valid slots may be written at all (T-06-15).
   */
  function manualSave(): void {
    saveAttempts += 1;
    if (manualSavePending) {
      setSaveNotice("Save already in progress");
      return;
    }
    if (!canOverwrite(saveStatus)) {
      saveSkipReason = statusSkipReason(saveStatus);
      setSaveNotice("Saving is disabled — this save is read-only");
      return;
    }
    if (testTainted) {
      saveSkipReason = "tainted";
      setSaveNotice("Save skipped — test changes are not saved");
      return;
    }
    if (saveStatus === "valid") {
      // The committed slot is the only save: ask before replacing it. The
      // dialog's own state is the only gate, so a second Save while it is open
      // does nothing, and a Cancel that closed it leaves the next Save live.
      if (saveLoad?.isConfirming() !== true) {
        saveLoad?.confirmOverwrite();
        updateProbe();
      }
      return;
    }
    writeManualSave();
  }

  /** The confirmed (or absent-slot) manual write; never asks again. */
  function writeManualSave(): void {
    saveLoad?.cancelOverwrite();
    updateProbe();
    const inputs = buildSnapshotInputs();
    if (inputs === undefined) {
      saveSkipReason = "not-ready";
      setSaveNotice("Save failed — the game is not ready");
      return;
    }
    manualSavePending = true;
    queueSnapshot(inputs, true);
  }

  /**
   * D-23: the app-owned copy for a load that never touched the session.
   * `absent` is not an error state; the rest explain why the blob was refused.
   */
  function loadFailureCopy(reason: SaveParseFailure): string {
    switch (reason) {
      case "absent":
        return "No saved game to load";
      case "future-version":
        return "Save is from a newer version of Wegolite — cannot load";
      case "corrupt":
        return "Save is corrupt — cannot load";
      case "unreadable":
        return "Save could not be read";
    }
  }

  /** Show a failed load on the open overlay; the session is untouched. */
  function failLoad(copy: string): void {
    setSaveNotice(copy);
    updateProbe();
  }

  /**
   * D-22/SAVE-05: in-session Load through the exact boot pipeline.
   *
   * Everything that can throw — the read, the schema/migration/validator, the
   * saved system and layout, the restored state and the regenerated market —
   * happens before any live reference moves. Only then is the destination
   * scene built, and the install block that follows has no early return. A
   * failure therefore leaves the current scene, state, profile, market and
   * IndexedDB bytes exactly as they were (T-06-16).
   */
  async function loadFromSave(): Promise<void> {
    const currentInput = input;
    const currentStationDef = stationDef;
    const catalogue = commodities;
    if (
      loadingSave ||
      !saveScreenOpen ||
      currentInput === undefined ||
      currentStationDef === undefined ||
      catalogue === undefined
    ) {
      return;
    }
    loadingSave = true;
    try {
      const read = await saveBoot.store.read();
      if (disposed) return;
      if (read.kind !== "ok") {
        failLoad(
          read.kind === "absent"
            ? loadFailureCopy("absent")
            : "Save could not be read",
        );
        return;
      }
      // SAVE-01: the same parser, migration and allow-lists as boot.
      const parsed = parseSave(read.raw, saveBoot.allow);
      if (!parsed.ok) {
        failLoad(loadFailureCopy(parsed.reason));
        return;
      }
      const saved = parsed.save;
      const savedSystem = galaxyById.get(saved.system.id);
      if (savedSystem === undefined) {
        failLoad("Save is corrupt — cannot load");
        return;
      }

      let restored;
      let savedLayout;
      let nextMarket;
      let nextSeed;
      let nextTarget: string | undefined;
      try {
        savedLayout = deriveSystemLayout(savedSystem, currentStationDef);
        restored = restoreFromSave(saved, savedLayout, profileFromSave);
        // One seed beside the market it generated: a later arrival chains to
        // the market the player is actually looking at.
        nextSeed =
          restored.market?.seed ??
          restored.marketSeed ??
          marketSeedForSystem(saved.system.id);
        nextMarket =
          restored.market ?? generateMarket(savedSystem, catalogue, nextSeed);
        nextTarget =
          saved.targetSystem !== undefined && galaxyById.has(saved.targetSystem)
            ? saved.targetSystem
            : undefined;
      } catch {
        failLoad("Save could not be loaded");
        return;
      }

      // Build the scene last: a failure here is caught, and the scene manager
      // only retires the old scene once the new one exists.
      let nextLayout: SystemLayout;
      try {
        nextLayout = enterSystemById(saved.system.id);
      } catch {
        failLoad("Save could not be loaded");
        return;
      }

      // One synchronous install block: no early return after this point.
      state = restored.state;
      layout = nextLayout;
      profile = restored.profile;
      market = nextMarket;
      marketSeed = nextSeed;
      hyperspaceTargetId = nextTarget;
      previousPose = poseOf(restored.state);
      currentPose = previousPose;
      previousCameraWorld = undefined;
      stationScreen = "home";
      stationPending = null;
      stationNotice = "";
      stationMessage = "";
      stationPage = 1;
      chartSelectedId = undefined;
      lastTrade = null;
      chartOpen = false;
      chart?.hide();
      saveScreenOpen = false;
      manualSavePending = false;
      saveScreenNotice = "";
      saveLoad?.cancelOverwrite();
      saveLoad?.hide();
      saveStatus = "valid";
      saveLastClock = saved.clockSeconds;
      saveSkipReason = "";
      const restoredDocked = restored.state.mode === "docked";
      currentInput.setContext(restoredDocked ? "dockHome" : "flight");
      if (restoredDocked) {
        docked.show(system.name);
        hudCanvas.hidden = true;
        ensureSelection();
        renderStation();
      } else {
        docked.hide();
        hudCanvas.hidden = false;
        syncEconomyProbe();
      }
      // Publish the installed pose once, exactly like the boot restore, so a
      // proof reads the saved numbers and not a resumed simulation.
      probe.restore = {
        mode: restoredDocked ? "docked" : "inFlight",
        systemId: system.id,
        position: toTuple(restored.state.position),
        orientation: [
          restored.state.orientation.w,
          restored.state.orientation.x,
          restored.state.orientation.y,
          restored.state.orientation.z,
        ],
        speed: restored.state.speed,
        clock: restored.state.clockSeconds,
      };
      syncSaveProbe();
      // Hidden time is never replayed: discard the read latency.
      loop?.reset();
      lastMs = 0;
      renderFrame(0);
    } finally {
      loadingSave = false;
    }
  }

  /**
   * New game clears only a save this build understands. A future, unreadable,
   * unavailable or otherwise unknown blob is left byte-identical (WR-04,
   * D-14/T-04-47) and the write path stays disabled.
   */
  async function clearSaveForNewGame(): Promise<void> {
    if (!canClear(saveStatus)) {
      saveSkipReason = statusSkipReason(saveStatus);
      syncSaveProbe();
      return;
    }
    saveRevision += 1;
    const currentRevision = saveRevision;
    const result = await saveBoot.store.clear(currentRevision);
    if (result.committed) {
      saveStatus = "absent";
      saveSkipReason = "";
    } else if (isStoreUnavailable(result.reason)) {
      saveUnavailable = true;
    }
    syncSaveProbe();
  }

  function pause(): void {
    const currentState = state;
    if (currentState === undefined) {
      // The title/menu has no simulation; focus loss only clears input.
      input?.clearAll();
      return;
    }
    if (paused) {
      // Repeated blur/visibility events are idempotent.
      input?.clearAll();
      return;
    }
    paused = true;
    input?.clearAll();
    input?.setPaused(true);
    loop?.reset();
    pauseOverlay?.show();
  }

  function resume(): void {
    if (!paused) return;
    paused = false;
    input?.clearAll();
    input?.setPaused(false);
    // Hidden time is never replayed: the accumulator starts at zero and the
    // next frame delta is one rendered frame, not the time spent paused.
    loop?.reset();
    pauseOverlay?.hide();
    controlsPanel?.hide();
    settingsPanel?.hide();
  }

  function backToPause(): void {
    controlsPanel?.hide();
    settingsPanel?.hide();
    pauseOverlay?.show();
  }

  function openControls(): void {
    settingsPanel?.hide();
    controlsPanel?.show();
  }

  function openSettings(): void {
    controlsPanel?.hide();
    settingsPanel?.show();
  }

  /**
   * The synchronous screen-open sink (step 7): the input layer calls this
   * inside `keyDown`, so the context switches before the same-frame next key
   * resolves. F3/F5/F7/F8 are all reachable from home and from any section.
   */
  function openStationScreen(action: ActionId): void {
    const currentState = state;
    const currentInput = input;
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
      case "stationSystemData":
        screen = "systemData";
        break;
      default:
        return;
    }
    if (screen === undefined) return;

    stationScreen = screen;
    stationPending = null;
    stationNotice = "";
    stationPage = 1;
    if (screen === "market") ensureSelection();
    if (screen === "outfitting") {
      // Opening a screen always starts at the first row with no pending line.
      stationSelection = "";
      ensureOutfittingSelection();
    }
    currentInput.setContext("dockScreen");
    renderStation();
  }

  function backToHome(): void {
    if (stationScreen === "home") return;
    stationScreen = "home";
    stationPending = null;
    stationNotice = "";
    stationPage = 1;
    input?.setContext("dockHome");
    renderStation();
  }

  /** D-09: resolve and install a new system scene; never rebuild the dock port. */
  function enterSystemById(id: string): SystemLayout {
    const currentStationDef = stationDef;
    if (currentStationDef === undefined) {
      throw new Error(
        "Wegolite: cannot enter a system before the station loads.",
      );
    }
    const next = galaxyById.get(id);
    if (next === undefined) {
      throw new Error(`Wegolite: no system with id "${id}" in this galaxy.`);
    }
    const nextScene = scenes.enterSystem(next, currentStationDef);
    const nextLayout = scenes.layout();
    if (nextLayout === undefined) {
      throw new Error(
        `Wegolite: the scene manager entered "${id}" without a layout.`,
      );
    }
    system = next;
    scene = nextScene;
    layout = nextLayout;
    // The new dust field has no camera history; a stale delta would smear it.
    previousCameraWorld = undefined;
    return nextLayout;
  }

  /** The committed target record, resolved through the validated catalogue. */
  function targetSystem(): System | undefined {
    if (hyperspaceTargetId === undefined) return undefined;
    return galaxyById.get(hyperspaceTargetId);
  }

  function currentChartView(overlay: ChartOverlay): ChartView {
    return buildChartView(
      galaxy,
      system.id,
      hyperspaceTargetId,
      chartRange,
      profile.fuel,
      overlay.viewport(),
      chartSelectedId,
    );
  }

  function refreshChart(): void {
    const overlay = chart;
    if (overlay === undefined) return;
    overlay.view(currentChartView(overlay));
  }

  function openChart(): void {
    const currentState = state;
    const currentInput = input;
    const overlay = chart;
    if (
      currentState === undefined ||
      currentInput === undefined ||
      overlay === undefined
    ) {
      return;
    }
    // Pitfall 13: F6 is inert during the launch cinematic, and an overlay must
    // never open beneath the pause overlay.
    if (paused || chartOpen || currentState.mode === "launching") return;
    chartOpen = true;
    contextBeforeChart = currentInput.getContext();
    currentInput.setContext("chart");
    // The overlay is still `hidden` when the first view is built, so its
    // client size is zero. Show it, then rebuild against the real viewport.
    overlay.show(currentChartView(overlay));
    overlay.view(currentChartView(overlay));
    updateProbe();
  }

  function closeChart(): void {
    if (!chartOpen) return;
    chartOpen = false;
    chart?.hide();
    input?.setContext(contextBeforeChart);
    // Hidden time is never replayed; the accumulator starts at zero.
    loop?.reset();
    updateProbe();
  }

  /** The one slot line: the autosave key, the system and the live clock. */
  function saveSlotText(): string {
    const clock = state === undefined ? "" : formatClock(state.clockSeconds);
    return `Autosave · ${system.name} · ${clock}`;
  }

  /**
   * D-20: F2 opens the standalone screen only while docked. The keyboard only
   * dispatches F2 from `dockHome`/`dockScreen`; this revalidates the live mode,
   * the pause overlay and the chart, so no overlay can open over another one.
   */
  function openSaveScreen(): void {
    const currentState = state;
    const currentInput = input;
    const screen = saveLoad;
    if (
      currentState === undefined ||
      currentInput === undefined ||
      screen === undefined
    ) {
      return;
    }
    if (paused || saveScreenOpen || chartOpen) return;
    if (currentState.mode !== "docked") return;
    saveScreenOpen = true;
    contextBeforeSaveScreen = currentInput.getContext();
    currentInput.setContext("saveScreen");
    screen.show(saveSlotText());
    saveScreenNotice = canOverwrite(saveStatus)
      ? ""
      : "Saving is disabled — this save is read-only";
    screen.setNotice(saveScreenNotice);
    updateProbe();
  }

  /** Hide F2 and restore the station context the player left. */
  function closeSaveScreen(): void {
    if (!saveScreenOpen) return;
    saveScreenOpen = false;
    saveLoad?.cancelOverwrite();
    saveLoad?.hide();
    input?.setContext(contextBeforeSaveScreen);
    // Return focus to the station screen the input context just restored.
    const stationScreenElement = document.getElementById("station-screen");
    stationScreenElement?.focus({ preventScroll: true });
    updateProbe();
  }

  /**
   * Apply one drained F2-screen edge. The live open flag is revalidated here so
   * a queued action cannot act on a screen the player already closed.
   */
  function applySaveScreenAction(action: ActionId): void {
    const screen = saveLoad;
    if (screen === undefined) return;
    switch (action) {
      case "saveLoad":
        if (saveScreenOpen) closeSaveScreen();
        else openSaveScreen();
        break;
      case "saveScreenReturn":
        if (screen.isConfirming()) {
          screen.cancelOverwrite();
          updateProbe();
        } else {
          closeSaveScreen();
        }
        break;
      // While the overwrite dialog is open it owns input: row navigation and
      // the Save/Load shortcuts are inert behind it.
      case "saveScreenUp":
        if (saveScreenOpen && !screen.isConfirming()) screen.moveSelection(-1);
        break;
      case "saveScreenDown":
        if (saveScreenOpen && !screen.isConfirming()) screen.moveSelection(1);
        break;
      case "saveScreenSave":
        if (saveScreenOpen && !screen.isConfirming()) manualSave();
        break;
      case "saveScreenConfirm":
        if (!saveScreenOpen) break;
        if (screen.isConfirming()) screen.acceptOverwrite();
        else screen.activate();
        break;
      case "saveScreenCancel":
        if (saveScreenOpen && screen.isConfirming()) {
          screen.cancelOverwrite();
          updateProbe();
        }
        break;
      case "saveScreenLoad":
        if (saveScreenOpen && !screen.isConfirming()) void loadFromSave();
        break;
      default:
        break;
    }
  }

  function handleSaveScreenActions(actions: readonly ActionId[]): void {
    for (const action of actions) applySaveScreenAction(action);
  }

  function selectChartSystem(id: string): void {
    if (!chartOpen) return;
    chartSelectedId = id;
    refreshChart();
  }

  function moveChartSelection(dx: number, dy: number): void {
    const base =
      (chartSelectedId === undefined
        ? undefined
        : galaxyById.get(chartSelectedId)) ?? system;
    const next = nearestInDirection(galaxy, base, dx, dy);
    if (next !== undefined) chartSelectedId = next.id;
    refreshChart();
  }

  /** Apply one drained chart edge; the live open flag is revalidated here. */
  function applyChartAction(action: ActionId): void {
    switch (action) {
      case "chart":
        if (chartOpen) closeChart();
        else openChart();
        break;
      case "chartBack":
        closeChart();
        break;
      case "chartRange":
        if (!chartOpen) return;
        chartRange = chartRange === "short" ? "long" : "short";
        refreshChart();
        break;
      case "chartConfirm":
        // A click only selects (D-02): Enter is the commit.
        if (!chartOpen || chartSelectedId === undefined) return;
        hyperspaceTargetId = chartSelectedId;
        refreshChart();
        break;
      case "chartUp":
        if (chartOpen) moveChartSelection(0, 1);
        break;
      case "chartDown":
        if (chartOpen) moveChartSelection(0, -1);
        break;
      case "chartLeft":
        if (chartOpen) moveChartSelection(-1, 0);
        break;
      case "chartRight":
        if (chartOpen) moveChartSelection(1, 0);
        break;
      default:
        break;
    }
  }

  function handleChartActions(actions: readonly ActionId[]): void {
    for (const action of actions) applyChartAction(action);
  }

  /** D-06 copy is app-owned; the sim event carries a payload-free reason. */
  function refusalCopy(reason: HyperspaceRefusal): string {
    switch (reason) {
      case "no target":
        return "No target selected";
      case "too far":
        return "Destination is too far";
      case "insufficient fuel":
        return "Insufficient fuel";
    }
  }

  /** D-09: the synchronous arrival swap and its one seeded market. */
  function handleHyperspaceJumped(event: {
    destinationId: string;
    clockDeltaSeconds: number;
    fuelCost: number;
  }): void {
    const currentState = state;
    const currentConfig = config;
    const catalogue = commodities;
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
      lastRefusal = { reason: "too far" };
      messages.enqueuePriority(refusalCopy("too far"));
      return;
    }
    const originId = system.id;
    const previousSeed = marketSeed ?? marketSeedForSystem(originId);
    const nextSeed = arrivalMarketSeed(destination.id, previousSeed);
    const nextFuel = Math.max(0, profile.fuel - event.fuelCost);

    // Build the destination scene before retiring the origin (T-06-13), then
    // install state, fuel, market and seed in one synchronous block.
    const arrivedLayout = enterSystemById(destination.id);
    profile = { ...profile, fuel: nextFuel };
    market = generateMarket(destination, catalogue, nextSeed);
    marketSeed = nextSeed;
    applyWitchpointArrival(
      currentState,
      arrivedLayout,
      currentConfig,
      originId,
      destination.id,
    );
    const arrivedPose = poseOf(currentState);
    previousPose = arrivedPose;
    currentPose = arrivedPose;
    stationScreen = "home";
    stationPending = null;
    stationNotice = "";
    stationMessage = "";
    stationPage = 1;
    chartSelectedId = undefined;
    lastJump = {
      destinationId: destination.id,
      clockDeltaSeconds: event.clockDeltaSeconds,
      fuelCost: event.fuelCost,
    };
    messages.enqueue(`Arrived at ${destination.name}`);
    // The arrival anchor is a complete in-flight v2 snapshot.
    autosave();
    syncEconomyProbe();
  }

  /**
   * Apply one drained station action. The live mode, context and screen are
   * revalidated here, so a queued action cannot apply a stale trade after a
   * screen change, a dock or a pause.
   */
  function applyStationAction(action: ActionId): void {
    const currentState = state;
    const currentInput = input;
    if (currentState?.mode !== "docked" || currentInput === undefined) return;
    if (paused) return;
    const contexts = ACTION_CONTEXTS[action];
    if (!contexts.includes(currentInput.getContext())) return;

    switch (action) {
      case "stationBack":
        backToHome();
        break;
      case "stationUp":
        if (stationScreen === "market") {
          moveSelection(-1);
          renderStation();
        } else if (stationScreen === "outfitting") {
          moveOutfittingSelection(-1);
          renderStation();
        }
        break;
      case "stationDown":
        if (stationScreen === "market") {
          moveSelection(1);
          renderStation();
        } else if (stationScreen === "outfitting") {
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
        if (stationScreen === "market") confirmTrade();
        else if (stationScreen === "outfitting") confirmFit();
        break;
      case "stationCancel":
        cancelTrade();
        break;
      case "stationPageNext":
        if (stationScreen === "status") {
          stationPage = 2;
          renderStation();
        }
        break;
      case "stationPagePrevious":
        if (stationScreen === "status") {
          stationPage = 1;
          renderStation();
        }
        break;
      default:
        break;
    }
  }

  function resetAllSettings(): void {
    const fresh = resetSettings();
    if (bindings !== undefined) {
      for (const action of ACTION_IDS) {
        bindings[action] = [...(fresh.bindings[action] ?? [])];
      }
      settings = { ...fresh, bindings };
      input?.setBindings(bindings);
      controlsPanel?.refresh();
    } else {
      settings = fresh;
    }
    launchSeen = false;
  }

  function onSubpanelKeyDown(event: KeyboardEvent): void {
    if (event.code !== "Escape") return;
    if (controlsPanel?.isCapturing() === true) return;
    if (controlsPanel?.isOpen() !== true && settingsPanel?.isOpen() !== true) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    backToPause();
  }

  window.addEventListener("keydown", onSubpanelKeyDown, {
    capture: true,
    signal: uiController.signal,
  });

  /**
   * D-10: after the first viewing, any key during `launching` skips to the
   * handover. Before `launchSeen` the key is ignored, so the first launch always
   * plays in full. The skip is a command, not a state mutation: the simulation
   * still applies the +600 s clock exactly once.
   */
  function onLaunchKeyDown(event: KeyboardEvent): void {
    const currentState = state;
    if (currentState === undefined || currentState.mode !== "launching") return;
    if (paused || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!launchSequence.canSkip(launchSeen)) return;
    pending.push({ kind: "skipLaunch" });
    event.preventDefault();
  }

  window.addEventListener("keydown", onLaunchKeyDown, {
    capture: true,
    signal: uiController.signal,
  });

  function handleEvent(event: SimEvent): void {
    switch (event.kind) {
      case "launched":
        launchSequence.reset();
        stationScreen = "home";
        stationPending = null;
        stationNotice = "";
        stationMessage = "";
        stationPage = 1;
        input?.setContext("flight");
        docked.hide();
        hudCanvas.hidden = false;
        messages.enqueue("Launching — stand by");
        // D-17: no write here. The pre-launch anchor was taken in `frame()`
        // while the state was still docked.
        syncEconomyProbe();
        break;
      case "launchComplete":
        launchSequence.markSeen();
        launchSeen = true;
        if (settings !== undefined && !settings.launchSeen) {
          settings.launchSeen = true;
          persistSettings();
        }
        messages.enqueue("Arrows pitch and roll · W and S change speed");
        break;
      case "docked": {
        // D-12: the exact delta is the event's, never a wall/frame comparison.
        lastDockClockDelta = event.clockDelta;
        launchSequence.reset();
        stationScreen = "home";
        stationPending = null;
        stationNotice = "";
        stationMessage = "";
        stationPage = 1;
        input?.setContext("dockHome");
        docked.show(system.name);
        ensureSelection();
        renderStation();
        if (event.via === "computer") {
          messages.enqueuePriority("Docking computers engaged");
          stationMessage = "Docking computers engaged";
          renderStation();
        }
        // D-09/D-15: stop any held input and collapse the interpolation window
        // onto the docked pose so the camera does not smear across the teleport.
        input?.clearAll();
        const currentState = state;
        if (currentState !== undefined) {
          const dockedPose = poseOf(currentState);
          previousPose = dockedPose;
          currentPose = dockedPose;
        }
        // D-17: both manual and computer docking anchor once, after the station
        // screen, selection and docked pose are ready. No other path writes on
        // docking.
        autosave();
        break;
      }
      case "dockDenied":
        // D-11: fixed app-owned copy; priority so it is visible immediately.
        messages.enqueuePriority(
          event.reason === "notInstalled"
            ? "No docking computer fitted"
            : "Too far from the station to engage docking computer",
        );
        break;
      case "torusEngaged":
        messages.enqueue(`Torus engaged at ${event.factor.toFixed(1)}×`);
        break;
      case "torusDisengaged":
        messages.enqueue("Torus disengaged");
        break;
      case "massLockChanged":
        if (event.locked) messages.enqueue("Mass locked");
        break;
      case "bounce":
        dockFeedback.trigger("bounce", state?.flightTime ?? 0);
        messages.enqueuePriority(bounceMessage(event));
        break;
      case "scrape": {
        // Pitfall 8: the sim emits one scrape per correcting tick (120 Hz);
        // the message line is throttled to one per simulated second.
        const now = state?.flightTime ?? 0;
        dockFeedback.trigger("scrape", now);
        if (shouldEmitScrapeMessage(lastScrapeMessageTime, now)) {
          messages.enqueuePriority(
            "Scrape - ease toward the centre of the slot",
          );
          lastScrapeMessageTime = now;
        }
        break;
      }
      case "compassTargetChanged":
        messages.enqueue(`Compass target: ${event.target}`);
        break;
      case "hyperspaceCountdownStarted": {
        const name = galaxyById.get(event.destinationId)?.name ?? "(Unknown)";
        messages.enqueue(
          `Hyperspace to ${name} in ${String(countdownSecondsRemaining(event.countdownSteps))} seconds`,
        );
        break;
      }
      case "hyperspaceCountdownCancelled":
        messages.enqueue("Hyperspace countdown cancelled");
        break;
      case "hyperspaceRefused":
        lastRefusal = { reason: event.reason };
        messages.enqueuePriority(refusalCopy(event.reason));
        break;
      case "hyperspaceJumped":
        handleHyperspaceJumped(event);
        break;
    }
  }

  function updateProbe(): void {
    probe.calls = renderer.info.render.calls;
    probe.triangles = renderer.info.render.triangles;
    probe.renders = renderer.info.render.frame;
    probe.memory = readMemory(renderer);
    probe.paused = paused;
    probe.systemId = system.id;
    probe.chart = {
      open: chartOpen,
      range: chartRange,
      ...(hyperspaceTargetId === undefined
        ? {}
        : { targetId: hyperspaceTargetId }),
      ...(chartSelectedId === undefined ? {} : { selectedId: chartSelectedId }),
    };
    probe.hyperspace = {
      ...(hyperspaceTargetId === undefined
        ? {}
        : { targetId: hyperspaceTargetId }),
      countdown: state?.hyperspaceCountdown ?? 0,
      lastJump,
      lastRefusal,
    };
    probe.saveScreen = {
      open: saveScreenOpen,
      row: saveLoad?.selection() ?? "save",
      confirming: saveLoad?.isConfirming() ?? false,
      notice: saveScreenNotice,
    };

    const currentState = state;
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
        seen: launchSeen,
      };
      probe.dock = {
        dockCount: currentState.dockCount,
        scrapeCount: currentState.scrapeTicks,
        bounceCount: currentState.bounceCount,
        shake: dockFeedback.shakeStrength(currentState.flightTime),
        flash: dockFeedback.flashAlpha(currentState.flightTime),
        outcome: currentState.mode === "docked" ? "docked" : "inFlight",
        lastClockDelta: lastDockClockDelta,
      };
    }

    if (probe.test !== undefined) probe.test.tainted = testTainted;

    const currentLayout = layout;
    const currentScene = scene;
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

    const currentHud = hud;
    if (currentHud !== undefined) {
      const model = lastModel;
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
        hyperspaceTarget: model === undefined ? "" : model.hyperspaceTarget,
        bounds: currentHud.bounds,
      };
    }

    probe.hints = hints === undefined ? [] : [...hints.seen];
  }

  function renderFrame(alpha: number): void {
    const currentState = state;
    const currentLayout = layout;
    const currentConfig = config;
    const currentScene = scene;
    const currentHud = hud;
    if (
      currentState === undefined ||
      currentLayout === undefined ||
      currentConfig === undefined ||
      currentScene === undefined ||
      currentHud === undefined
    ) {
      return;
    }

    // WORLD-02: the live projection aspect, published from the one camera that
    // is actually rendered. `start()`, every frame and `swapSystem()` all pass
    // through here, so a rebuilt scene can never leave the field stale.
    probe.aspect = currentScene.camera.aspect;

    applyStationRoll(currentScene, currentState.stationAngle);
    // The launch cinematic and the cockpit handover supply a world pose; while
    // docked the first-person pose is derived from the interpolated ship pose.
    const pose = interpolatePose(previousPose, currentPose, alpha);
    let camera: CameraPose | null = null;
    if (currentState.mode === "launching") {
      camera = computeLaunchCamera(currentLayout, pose.position);
    } else if (currentState.mode === "inFlight") {
      camera = computeCockpitCamera(
        pose.position,
        pose.orientation,
        dockFeedback.shakeOffset(currentState.flightTime),
      );
    }
    const cameraWorld = applyFrame(
      currentScene,
      previousPose,
      currentPose,
      alpha,
      currentLayout,
      camera,
      currentState.flightTime,
    );
    // D-04: dust is camera-local. The world delta comes from the one transform
    // path; the field wraps inside its box, so it never drifts to the origin.
    const currentDust = currentScene.dust;
    currentDust.update(
      previousCameraWorld === undefined
        ? vec(0, 0, 0)
        : sub(cameraWorld, previousCameraWorld),
      currentState.speed,
      currentState.torus.factor,
    );
    previousCameraWorld = cameraWorld;
    // D-10: the Cobra is shown for the scripted exit and hidden in the cockpit;
    // it is toggled, never rebuilt.
    currentScene.ship.visible = currentState.mode === "launching";

    renderer.render(currentScene.scene, currentScene.camera);

    // The flight HUD is not drawn while docked (D-09 shows the status panel).
    const isDocked = currentState.mode === "docked";
    hudCanvas.hidden = isDocked;
    if (!isDocked) {
      const currentBreakPattern = breakPattern;
      if (
        currentState.mode === "launching" &&
        currentBreakPattern !== undefined
      ) {
        // D-10: the break pattern covers the cut to the cockpit, and is driven
        // by the same fixed-step timeline as the launch itself.
        currentBreakPattern.draw(
          launchSequence.elapsed,
          currentState.launchCount,
        );
      } else {
        const snapshot = currentState.hyperspaceTarget;
        const message =
          currentState.hyperspaceCountdown > 0 && snapshot !== null
            ? `Hyperspace to ${galaxyById.get(snapshot.id)?.name ?? "(Unknown)"} in ${String(countdownSecondsRemaining(currentState.hyperspaceCountdown))} seconds`
            : messages.current(currentState.flightTime);
        const model = buildHudModel(
          currentState,
          currentLayout,
          currentConfig,
          message,
          dockFeedback.flashAlpha(currentState.flightTime),
          targetSystem()?.name ?? "",
        );
        currentHud.draw(model);
        lastModel = model;
      }
    }
    showHint(currentState);
    updateProbe();
  }

  /** D-11: one message-line hint at a time, never a modal or overlay. */
  function showHint(currentState: FlightState): void {
    const currentHints = hints;
    if (currentHints === undefined) return;
    const context: HintContext = {
      mode: currentState.mode,
      massLocked: currentState.torus.massLocked,
      torusEngaged: currentState.torus.engaged,
      speedInput: currentFrame.speed,
      pitchRollInput: currentFrame.pitch !== 0 || currentFrame.roll !== 0,
    };
    const hint = currentHints.maybeShow(context);
    if (hint === null) return;
    probe.hint = hint;
    if (currentState.mode === "docked") {
      stationMessage = hint;
      renderStation();
    } else messages.enqueue(hint);
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);

    const currentState = state;
    const currentLayout = layout;
    const currentConfig = config;
    const currentInput = input;
    const currentLoop = loop;
    if (
      currentState === undefined ||
      currentLayout === undefined ||
      currentConfig === undefined ||
      currentInput === undefined ||
      currentLoop === undefined
    ) {
      return;
    }

    const delta = lastMs === 0 ? 0 : (now - lastMs) / 1000;
    lastMs = now;

    if (currentInput.consumePauseToggle()) {
      if (paused) resume();
      else pause();
    }

    // D-01: consume the chart edges before the freeze branch, so F6 opens and
    // closes and a KeyP over the chart still reaches the pause handler above.
    handleChartActions(currentInput.drainChartActions());
    // D-20: the F2 screen is another opaque edge-driven overlay; its actions
    // are applied before the freeze so Save/Load can run and Return can close.
    if (chartOpen) currentInput.drainSaveScreenActions();
    else handleSaveScreenActions(currentInput.drainSaveScreenActions());

    if (chartOpen) {
      // The overlay is opaque: drain everything, advance nothing, paint nothing.
      currentInput.drainCommands();
      currentInput.drainStationActions();
      pending.length = 0;
      currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
      updateProbe();
      return;
    }

    if (saveScreenOpen) {
      // The save screen is opaque too: no fixed step runs behind it.
      currentInput.drainCommands();
      currentInput.drainStationActions();
      pending.length = 0;
      currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
      updateProbe();
      return;
    }

    // Station actions are discarded while paused or in flight; in the docked
    // mode each one is revalidated against the live screen and context.
    const stationActions = currentInput.drainStationActions();
    if (!paused && currentState.mode === "docked") {
      for (const action of stationActions) applyStationAction(action);
    }

    let alpha = 0;
    if (!paused) {
      const commands: Command[] = [
        ...currentInput.drainCommands(),
        ...pending,
      ].filter(
        (command) =>
          command.kind !== "launch" ||
          (currentState.mode === "docked" && stationScreen === "home"),
      );
      pending.length = 0;
      // D-17: the pre-launch anchor is taken while the state is still docked,
      // before `beginLaunch` applies the +600 s transition.
      if (
        currentState.mode === "docked" &&
        stationScreen === "home" &&
        commands.some((command) => command.kind === "launch")
      ) {
        autosave();
      }
      // D-06: while a countdown runs, the same key aborts it at no cost. The
      // mapping happens on the drained array, before the sim sees a redundant
      // begin, so no app timer and no double command exist.
      if (currentState.hyperspaceCountdown > 0) {
        for (let index = 0; index < commands.length; index += 1) {
          if (commands[index]?.kind === "beginHyperspace") {
            commands[index] = { kind: "cancelHyperspace" };
          }
        }
      }
      // One immutable frame per rendered frame, shared by every fixed step.
      const frameInput = currentInput.frame();
      currentFrame = frameInput;

      alpha = currentLoop.advance(delta, commands, (stepCommands) => {
        // A jump can commit mid-frame; read the live session layout/system for
        // every step after the swap (never a frame-captured origin layout).
        const liveState = state;
        const liveLayout = layout;
        const liveConfig = config;
        if (
          liveState === undefined ||
          liveLayout === undefined ||
          liveConfig === undefined
        ) {
          return;
        }
        previousPose = currentPose;
        const modeBefore = liveState.mode;
        const controller = liveState.mode === "launching" ? scripted : player;
        const intent = controller.update(flightView(liveState), frameInput);
        // Ownership travels beside the command, never inside it: one read-only
        // set per frame, derived from the profile (T-04-19).
        const equipment = new Set(profile.equipment);
        const committedTarget = targetSystem();
        const hyperspace = {
          fuel: profile.fuel,
          origin: { id: system.id, x: system.chartX, y: system.chartY },
          ...(committedTarget === undefined
            ? {}
            : {
                target: {
                  id: committedTarget.id,
                  x: committedTarget.chartX,
                  y: committedTarget.chartY,
                },
              }),
        };
        const stepOptions: StepOptions =
          dockGeometry === undefined
            ? { equipment, hyperspace }
            : { dock: dockGeometry, equipment, hyperspace };
        const events = stepFlight(
          liveState,
          liveLayout,
          liveConfig,
          intent,
          stepCommands,
          DT,
          stepOptions,
        );
        for (const event of events) handleEvent(event);
        // The view timeline advances on the same fixed steps as the simulation,
        // and only after the step that entered `launching` (which does not move
        // the ship either).
        if (modeBefore === "launching") {
          launchSequence.advance(DT, liveState.mode === "inFlight");
        }
        currentPose = poseOf(liveState);
      });
    } else {
      // A key pressed while paused must not become a queued edge command that
      // fires on resume.
      currentInput.drainCommands();
      pending.length = 0;
      currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
    }

    renderFrame(alpha);
  }

  async function start(options: StartOptions = {}): Promise<void> {
    // The guard is set synchronously: `state` is only assigned after two
    // awaits, so a second click during the load would otherwise start a second
    // frame loop (two RAF chains, two HUDs, two input sources) that `dispose()`
    // could never fully cancel.
    if (state !== undefined || starting || disposed) return;
    starting = true;

    // D-09/T-06-12: every target id is resolved through this validated map.
    galaxyById.clear();
    for (const entry of galaxy) galaxyById.set(entry.id, entry);
    if (!galaxyById.has(system.id)) galaxyById.set(system.id, system);

    const restore = options.restore;
    const restoring = restore !== undefined && options.fresh !== true;
    if (!restoring) {
      // New game: the clear must commit before this promise resolves, so a
      // reload after the click cannot resurrect the old blob. A future blob is
      // never touched (T-04-47).
      await clearSaveForNewGame();
      if (disposed) return;
    }

    try {
      await assets.preload();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // T-3-02: a failed model load must be visible, never a blank canvas, and
      // no frame may be scheduled after it.
      showBootFailure(reason);
      publishFailure(reason);
      return;
    }

    // A `pagehide` during the load disposes the session; resuming into a
    // disposed asset cache would reject unhandled.
    if (disposed) return;

    const catalogue = await loadShipCatalogue();

    if (disposed) return;

    // D-10/T-04-43: the equipment catalogue is the only source of a price and a
    // tech level. The commodity catalogue is the only source of the market
    // coefficients. A missing or malformed record fails the boot visibly,
    // exactly like the ship catalogue.
    try {
      const [equipment, loadedCommodities, loadedLabels] = await Promise.all([
        loadEquipment(),
        loadCommodities(),
        loadLabels(),
      ]);
      if (disposed) return;
      equipmentCatalogue = equipment;
      commodities = loadedCommodities;
      labels = loadedLabels;
      commodityUnits = new Map(
        loadedCommodities.map((commodity) => [commodity.key, commodity.unit]),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showBootFailure(reason);
      publishFailure(reason);
      return;
    }

    const playerDef = playerShip(catalogue).shipDef;
    const stationEntry = stationShip(catalogue);
    const station = stationEntry.shipDef;
    stationDef = station;
    stationKey = stationEntry.key;

    const flightConfig = deriveFlightConfig(playerDef);
    // SAVE-03/D-18: resolve the saved system before the first scene is built,
    // so a Continue never flashes Lave or builds the wrong layout.
    if (restoring && restore !== undefined) {
      const savedSystem = galaxyById.get(restore.system.id);
      if (savedSystem !== undefined) system = savedSystem;
    }
    const nextScene = scenes.enterSystem(system, station);
    const systemLayout = scenes.layout();
    if (systemLayout === undefined) {
      throw new Error(
        "Wegolite: the scene manager entered a system without a layout.",
      );
    }

    // D-01/DOCK-01: the generated aperture is validated and converted into the
    // port frame once, here, and injected into every fixed step as plain data.
    try {
      const rawDockPort = await loadDockPort();
      if (disposed) return;
      dockGeometry = createDockGeometry(rawDockPort, systemLayout.dockOffset);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showBootFailure(reason);
      publishFailure(reason);
      return;
    }

    let flightState: FlightState;
    let restoredProfile: PlayerProfile | undefined;
    let restoredMarket: Market | undefined;
    let restoredMarketSeed: number | undefined;
    if (restoring && restore !== undefined) {
      const restored = restoreFromSave(restore, systemLayout, profileFromSave);
      flightState = restored.state;
      restoredProfile = restored.profile;
      restoredMarket = restored.market;
      restoredMarketSeed = restored.market?.seed ?? restored.marketSeed;
    } else {
      flightState = initFlightState(systemLayout);
    }
    const restoredInFlight = flightState.mode === "inFlight";

    state = flightState;
    layout = systemLayout;
    config = flightConfig;
    scene = nextScene;
    profile = restoredProfile ?? newProfile();
    // SAV-03/D-18: the committed target travels with the save. Only an id the
    // validated catalogue knows is installed (T-06-12).
    if (restoring && restore !== undefined) {
      const savedTarget = restore.targetSystem;
      hyperspaceTargetId =
        savedTarget !== undefined && galaxyById.has(savedTarget)
          ? savedTarget
          : undefined;
    }

    // D-17/D-18/D-19: resolve the seed once and generate the market once. A
    // later `docked` event reuses this market; only Phase 6's system change re-seeds.
    const loadedCatalogue = commodities ?? [];
    marketSeed =
      restoring && restore !== undefined
        ? (restoredMarketSeed ?? marketSeedForSystem(system.id))
        : marketSeedForSystem(system.id);
    // D-18/SAVE-06: a saved snapshot is used verbatim; only a v1 migration or a
    // fresh game regenerates from the seed. Plan 06-04 owns the system swap.
    market =
      restoredMarket ?? generateMarket(system, loadedCatalogue, marketSeed);
    ensureSelection();
    hud = createHud(hudCanvas);
    hud.resize();
    breakPattern = createBreakPattern(hudCanvas);
    hudCanvas.hidden = true;
    chart = createChart(document.body);
    chart.setViewBuilder((viewport) =>
      buildChartView(
        galaxy,
        system.id,
        hyperspaceTargetId,
        chartRange,
        profile.fuel,
        viewport,
        chartSelectedId,
      ),
    );
    chart.onSelect((id) => {
      selectChartSystem(id);
    });
    saveLoad = createSaveLoadScreen(document.body);
    saveLoad.onReturn(() => {
      closeSaveScreen();
    });
    saveLoad.onSave(() => {
      manualSave();
    });
    saveLoad.onLoad(() => {
      void loadFromSave();
    });
    saveLoad.onOverwriteConfirmed(() => {
      writeManualSave();
    });
    // A mouse Cancel closes the dialog on the screen alone; the session only
    // needs to publish the state the dialog now reports.
    saveLoad.onOverwriteCancelled(() => {
      updateProbe();
    });

    const loaded = loadSettings();
    const bindingMap = createBindingMap(loaded.bindings);
    settings = { ...loaded, bindings: bindingMap };
    bindings = bindingMap;
    launchSeen = loaded.launchSeen;
    if (launchSeen) launchSequence.markSeen();
    hints = createHintController({
      bindings: bindingMap,
      seen: settings.hintsSeen,
      onSeen: (id) => {
        const currentSettings = settings;
        if (currentSettings === undefined) return;
        if (!currentSettings.hintsSeen.includes(id)) {
          currentSettings.hintsSeen.push(id);
        }
        persistSettings();
      },
    });

    input = createKeyboardInputSource(bindingMap);
    input.setStationScreenHandler((action) => {
      openStationScreen(action);
    });
    input.setContext(restoredInFlight ? "flight" : "dockHome");
    input.setPaused(false);
    input.attach();
    loop = createGameLoop();
    previousPose = poseOf(flightState);
    currentPose = previousPose;
    previousCameraWorld = undefined;

    pauseOverlay = createPauseOverlay({
      root: pauseRoot,
      gameRoot,
      onResume: () => {
        resume();
      },
      onControls: () => {
        openControls();
      },
      onSettings: () => {
        openSettings();
      },
    });
    controlsPanel = createControlsPanel(bindingMap, {
      root: controlsRoot,
      onChange: (next) => {
        input?.setBindings(next);
        persistSettings();
      },
      onReset: () => {
        resetAllSettings();
      },
      onBack: () => {
        backToPause();
      },
    });
    settingsPanel = createSettingsPanel({
      root: settingsRoot,
      onBack: () => {
        backToPause();
      },
      onControls: () => {
        openControls();
      },
      onReset: () => {
        resetAllSettings();
      },
    });

    // The hook exists only when explicitly asked for with exactly `?test=1`,
    // and only mutates the live state: no save, no arbitrary code (T-04-08).
    if (new URLSearchParams(window.location.search).get("test") === "1") {
      probe.test = createTestHook(
        flightState,
        { swapSystem, disposeSystem },
        () => {
          testTainted = true;
        },
        {
          setCredits: applyTestCredits,
          grantEquipment: applyTestEquipment,
        },
      );
    }

    title.hide();
    if (restoredInFlight) {
      // The last visibility decision: the station overlay must never reappear
      // over an installed in-flight scene.
      docked.hide();
      hudCanvas.hidden = false;
      input.setContext("flight");
      // No station render runs on this path, so publish the live economy and
      // durable identities explicitly for the reload proof.
      syncEconomyProbe();
      // Written once, by the install block; updateProbe never touches it, so a
      // proof reads the pose the restore installed, not a resumed one.
      probe.restore = {
        mode: "inFlight",
        systemId: system.id,
        position: [
          flightState.position.x,
          flightState.position.y,
          flightState.position.z,
        ],
        orientation: [
          flightState.orientation.w,
          flightState.orientation.x,
          flightState.orientation.y,
          flightState.orientation.z,
        ],
        speed: flightState.speed,
        clock: flightState.clockSeconds,
      };
    } else {
      input.setContext("dockHome");
      docked.show(system.name);
      renderStation();
    }
    docked.onLaunch(() => {
      // D-03: the Launch button is only live on the home screen.
      if (state?.mode !== "docked" || stationScreen !== "home") return;
      pending.push({ kind: "launch" });
    });

    renderFrame(0);
    rafId = requestAnimationFrame(frame);
  }

  function resize(): void {
    hud?.resize();
  }

  /**
   * WORLD-04 test surface: rebuild the active system scene through the manager.
   *
   * The flight state and layout stay put: a swap replaces the scene graph, not
   * the simulation, and only the render references move. That is exactly the
   * ownership boundary the disposal proof is about.
   */
  function performSwap(): void {
    const currentStationDef = stationDef;
    if (state === undefined || currentStationDef === undefined) return;
    scene = scenes.enterSystem(system, currentStationDef);
    layout = scenes.layout() ?? layout;
    // The new dust field has no camera history; a stale delta would smear it.
    previousCameraWorld = undefined;
  }

  function disposeSystem(): void {
    scenes.disposeSystem();
    scene = undefined;
    previousCameraWorld = undefined;
  }

  /**
   * Swap, then settle one real frame so the GPU counters the probe reports
   * describe the new scene rather than the frame before it.
   */
  async function swapSystem(): Promise<void> {
    if (state === undefined) return;
    performSwap();
    renderFrame(0);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
    renderFrame(0);
  }

  /**
   * Teardown (WORLD-04, T-3-22): stop the loop, release every listener, clear
   * the HUD, then free the scene and the shared cache in that order.
   *
   * Idempotent: `pagehide`, `webglcontextlost` and an explicit call may all
   * arrive for the same session. A second call must not double-free or throw.
   */
  function dispose(): void {
    if (disposed) return;
    disposed = true;

    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = 0;

    // Every listener this session added hangs off `uiController`; aborting it
    // also releases the sub-panel controllers' listeners through their own
    // disposers below.
    uiController.abort();
    input?.clearAll();
    input?.dispose();
    pauseOverlay?.dispose();
    controlsPanel?.dispose();
    settingsPanel?.dispose();

    // Scene first, then the cache that owns the shared GLBs it referenced.
    scenes.dispose();
    assets.dispose();

    breakPattern?.dispose();
    hud?.dispose();
    chart?.dispose();
    chart = undefined;
    chartOpen = false;
    saveLoad?.dispose();
    saveLoad = undefined;
    saveScreenOpen = false;
    docked.dispose();
    title.dispose();

    // Drop the live references so a late callback cannot read a disposed
    // scene, and withdraw the test surface with the session.
    state = undefined;
    scene = undefined;
    layout = undefined;
    delete probe.test;
    delete probe.save;
    delete probe.saveScreen;
    saveBoot.store.dispose();
  }

  return {
    start,
    resize,
    pause,
    resume,
    isPaused: () => paused,
    clearInput: () => {
      input?.clearAll();
    },
    dispose,
  };
}
