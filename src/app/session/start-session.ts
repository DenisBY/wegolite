// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The session lifecycle (Phase 8, D-12 step 9, ARCHITECTURE.md sections 4.2 and
 * 4.3): start-up, resize, the scene swap and the teardown, moved verbatim from
 * `createGameSession`.
 *
 * `createSessionLifecycle` registers the session's two window `keydown`
 * listeners at construction time (the same moment `createGameSession` did before
 * the split), guarded by `typeof window` so a Node unit test can build the
 * lifecycle without a DOM. Both carry the signal of the session's one
 * `AbortController`, so `dispose()` releases them by aborting it. No timer is
 * used anywhere in the session modules; the one animation frame a scene swap
 * waits on is tracked in `ctx.runtime.swapRafId` and cancelled by `dispose()`.
 *
 * Boot order matters (T-3-02): both GLBs are awaited before the first frame. On
 * a rejected load the session publishes a failure and returns without
 * scheduling a frame, never a live canvas over an empty scene.
 *
 * Deliberate deviations from a verbatim move (everything else is verbatim):
 * `swapSystem` tracks its settlement animation frame and re-checks `disposed`
 * after the await, and `dispose()` cancels that frame beside `rafId`.
 */

import {
  loadShipCatalogue,
  playerShip,
  stationShip,
} from "../../content/ships.js";
import { loadDockPort } from "../../content/dock-port.js";
import { loadEquipment } from "../../content/equipment.js";
import { loadCommodities } from "../../content/commodities.js";
import { loadLabels } from "../../content/labels.js";
import { loadShipHulls } from "../../content/ships-hulls.js";
import { loadNpcCatalogue } from "../../content/ships-npc.js";
import type { System } from "../../content/types.js";
import { createGameLoop } from "../game-loop.js";
import { createHintController } from "../hints.js";
import type { LaunchSequence } from "../launch-sequence.js";
import type { WegoliteProbe } from "../probe.js";
import type { RedrawGate } from "../redraw-gate.js";
import type { SceneManager } from "../scene-manager.js";
import type { GameSessionSave, StartOptions } from "../game-session.js";
import type { AssetCache } from "../../render/asset-cache.js";
import { parseTestFlags } from "./test-flags.js";
import { createInertPopulate, hullTable, trafficContent } from "./traffic.js";
import { createWorldLifecycle, restoreWorldAnchor } from "./world-lifecycle.js";
import {
  profileFromSave,
  restoreFromSave,
} from "../../persistence/autosave.js";
import { createBreakPattern } from "../../render/break-pattern.js";
import { createHud } from "../../render/hud/hud.js";
import type { Command } from "../../sim/commands.js";
import { createPlayerCombatState } from "../../sim/combat/state.js";
import { createDockGeometry } from "../../sim/dock/geometry.js";
import { deriveFlightConfig } from "../../sim/flight/config.js";
import { initFlightState, poseOf } from "../../sim/flight/state.js";
import type { FlightState } from "../../sim/flight/state.js";
import { newProfile } from "../../sim/player/profile.js";
import type { PlayerProfile } from "../../sim/player/profile.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../sim/economy/market.js";
import type { Market } from "../../sim/economy/market.js";
import { applyFit, checkFit } from "../../sim/player/outfitting.js";
import { createChart } from "../../ui/chart.js";
import { createSaveLoadScreen } from "../../ui/save-load.js";
import { buildChartView } from "../../ui/chart-model.js";
import { buildSystemDataModel } from "../../ui/station-model.js";
import { createStationNav } from "../../ui/station-nav.js";
import { createKeyboardInputSource } from "../../input/keyboard.js";
import { createBindingMap } from "../../input/bindings.js";
import { loadSettings } from "../../settings/store.js";
import { createControlsPanel } from "../../ui/controls.js";
import { createPauseOverlay } from "../../ui/pause.js";
import { createSettingsPanel } from "../../ui/settings-panel.js";
import type { StationShell } from "../../ui/station.js";
import type { TitleScreen } from "../../ui/title.js";
import type { ChartController } from "./chart-controller.js";
import type { SessionState } from "./context.js";
import type { HyperspaceController } from "./hyperspace-controller.js";
import type { ProbePublisher } from "./probe-publisher.js";
import type { RenderDriver } from "./render-driver.js";
import type { SaveController } from "./save-controller.js";
import type { SettingsController } from "./settings-controller.js";
import type { StationController } from "./station-controller.js";

/**
 * The bundle's build-time NPC traffic default for a session without `?test=1`,
 * replaced by a literal at build time: `true` in every deployed bundle
 * (vite.config.ts), `false` in the browser-test bundles (vite.e2e.config.ts,
 * vite.seams.config.ts) and `true` under Vitest (vitest.config.ts).
 */
declare const __WEGOLITE_TRAFFIC_DEFAULT__: boolean;

/** What the lifecycle calls outside the session context. */
export interface LifecycleDeps {
  readonly assets: Pick<AssetCache, "preload" | "dispose">;
  readonly scenes: Pick<
    SceneManager,
    "setQuality" | "enterSystem" | "layout" | "disposeSystem" | "dispose"
  >;
  readonly title: Pick<TitleScreen, "hide" | "dispose">;
  readonly docked: StationShell;
  readonly hudCanvas: HTMLCanvasElement;
  readonly probe: Pick<WegoliteProbe, "restore">;
  readonly pauseRoot: HTMLElement;
  readonly controlsRoot: HTMLElement;
  readonly gameRoot: HTMLElement;
  readonly settingsRoot: HTMLElement;
  /** The boot save read; only its store is disposed here. */
  readonly saveBoot: Pick<GameSessionSave, "store">;
  readonly galaxy: readonly System[];
  readonly galaxyById: Map<string, System>;
  /** The queue the Launch button and the launch-skip key push onto. */
  readonly pending: Command[];
  readonly launchSequence: Pick<LaunchSequence, "canSkip" | "markSeen">;
  /** Every listener this session adds hangs off this controller's signal. */
  readonly uiController: AbortController;
  readonly redrawGate: Pick<RedrawGate, "request">;
  /** The frame loop's `frame(now)`, scheduled by start-up. */
  readonly frame: (now: number) => void;
  readonly renderFrame: RenderDriver["renderFrame"];
  /** The single boot-failure surface and the probe's failure publication. */
  readonly showBootFailure: (reason: string) => void;
  readonly publishFailure: (reason: string) => void;
  readonly probePublisher: Pick<
    ProbePublisher,
    "updateProbe" | "syncEconomyProbe" | "bindTestHook" | "withdrawProbe"
  >;
  readonly syncStatusOverlay: HyperspaceController["syncStatusOverlay"];
  readonly ensureSelection: StationController["ensureSelection"];
  readonly refreshStationChrome: StationController["refreshStationChrome"];
  readonly renderStation: StationController["renderStation"];
  readonly syncStationNav: StationController["syncStationNav"];
  readonly fitContext: StationController["fitContext"];
  readonly commitProfile: StationController["commitProfile"];
  readonly openStationScreen: StationController["openStationScreen"];
  readonly navigateStation: StationController["navigateStation"];
  readonly setStationPage: StationController["setStationPage"];
  readonly clearSaveForNewGame: SaveController["clearSaveForNewGame"];
  readonly closeSaveScreen: SaveController["closeSaveScreen"];
  readonly manualSave: SaveController["manualSave"];
  readonly writeManualSave: SaveController["writeManualSave"];
  readonly loadFromSave: SaveController["loadFromSave"];
  readonly autosave: SaveController["autosave"];
  readonly selectChartSystem: ChartController["selectChartSystem"];
  readonly setChartCamera: ChartController["setChartCamera"];
  readonly persistSettings: SettingsController["persistSettings"];
  readonly resume: SettingsController["resume"];
  readonly openControls: SettingsController["openControls"];
  readonly openSettings: SettingsController["openSettings"];
  readonly backToPause: SettingsController["backToPause"];
  readonly resetAllSettings: SettingsController["resetAllSettings"];
  readonly applyQuality: SettingsController["applyQuality"];
  readonly syncQualityToggle: SettingsController["syncQualityToggle"];
  /** The Escape routing out of a controls or settings sub-panel. */
  readonly onSubpanelKeyDown: SettingsController["onSubpanelKeyDown"];
}

export function createSessionLifecycle(ctx: SessionState, deps: LifecycleDeps) {
  const {
    assets,
    scenes,
    title,
    docked,
    hudCanvas,
    probe,
    pauseRoot,
    controlsRoot,
    gameRoot,
    settingsRoot,
    saveBoot,
    galaxy,
    galaxyById,
    pending,
    launchSequence,
    uiController,
    redrawGate,
    frame,
    renderFrame,
    showBootFailure,
    publishFailure,
    probePublisher,
    syncStatusOverlay,
    ensureSelection,
    refreshStationChrome,
    renderStation,
    syncStationNav,
    fitContext,
    commitProfile,
    openStationScreen,
    navigateStation,
    setStationPage,
    clearSaveForNewGame,
    closeSaveScreen,
    manualSave,
    writeManualSave,
    loadFromSave,
    autosave,
    selectChartSystem,
    setChartCamera,
    persistSettings,
    resume,
    openControls,
    openSettings,
    backToPause,
    resetAllSettings,
    applyQuality,
    syncQualityToggle,
    onSubpanelKeyDown,
  } = deps;

  /**
   * D-10: after the first viewing, any key during `launching` skips to the
   * handover. Before `launchSeen` the key is ignored, so the first launch always
   * plays in full. The skip is a command, not a state mutation: the simulation
   * still applies the +600 s clock exactly once.
   */
  function onLaunchKeyDown(event: KeyboardEvent): void {
    const currentState = ctx.core.state;
    if (currentState === undefined || currentState.mode !== "launching") return;
    if (ctx.runtime.paused || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!launchSequence.canSkip(ctx.core.launchSeen)) return;
    pending.push({ kind: "skipLaunch" });
    event.preventDefault();
  }

  // The two window keydown registrations, in the order the facade made them
  // before the split (sub-panel Escape routing first, then the launch skip).
  // The guard keeps a Node unit test from throwing on a missing `window`.
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", onSubpanelKeyDown, {
      capture: true,
      signal: uiController.signal,
    });
    window.addEventListener("keydown", onLaunchKeyDown, {
      capture: true,
      signal: uiController.signal,
    });
  }

  /**
   * Start the session. Never rejects: a step that throws outside its own
   * handler (the ship catalogue, the scene build, a restore) is shown on the
   * failure surface, exactly like a failed asset load. Without this the title
   * screen would stay up with both buttons dead, because `starting` is set.
   */
  async function start(options: StartOptions = {}): Promise<void> {
    try {
      await startSession(options);
    } catch (error) {
      if (ctx.runtime.disposed) return;
      const reason = error instanceof Error ? error.message : String(error);
      console.error("Wegolite: the session failed to start", error);
      showBootFailure(reason);
      publishFailure(reason);
    }
  }

  /**
   * Construction order, as it was in `createGameSession.startSession` before
   * the split (each numbered step is a block below, in this sequence; any step
   * may return early on a failure or a dispose):
   *   1. the single-start guard (`state`, `starting`, `disposed`), then
   *      `starting` is set synchronously;
   *   2. the validated galaxy map is rebuilt, then the options are read;
   *   3. the asset cache is preloaded (a failure shows the boot failure);
   *   4. the ship catalogue; the equipment, commodity and label catalogues
   *      (one failure surface), then the station definition;
   *   5. the flight config; the saved system for a Continue; the settings and
   *      graphics quality; the first scene and its layout;
   *   6. the dock geometry from the generated aperture;
   *   7. the New-game clear of the save (only after every load succeeded);
   *   8. the flight state (a restore or a fresh one) and its installation, the
   *      profile and the saved target, then the status overlay;
   *   9. the market seed, then the market (restored or generated once), then
   *      the lifecycle re-anchor at the saved epoch, then the station
   *      selection;
   *  10. the HUD and the break pattern, the chart overlay, the Save/Load
   *      screen, the station nav;
   *  11. the binding map and the settings, the station chrome, the launch-seen
   *      flag and the hint controller;
   *  12. the keyboard input source and the game loop, the poses;
   *  13. the pause overlay, the controls panel and the settings panel;
   *  14. the hook binding, only when `?test=1` enabled it (the flags are read
   *      at the top of the function, right after the guard);
   *  15. the title is hidden, then the restore branch or the docked branch
   *      (the station overlay or the in-flight probe), the station nav sync;
   *  16. the Launch and Refuel handlers;
   *  17. the first direct draw, then the first animation frame.
   */
  async function startSession(options: StartOptions): Promise<void> {
    // The guard is set synchronously: `state` is only assigned after two
    // awaits, so a second click during the load would otherwise start a second
    // frame loop (two RAF chains, two HUDs, two input sources) that `dispose()`
    // could never fully cancel.
    if (
      ctx.core.state !== undefined ||
      ctx.runtime.starting ||
      ctx.runtime.disposed
    )
      return;
    ctx.runtime.starting = true;

    // D-10: the test flags are read from the URL exactly once, here, and only
    // exactly `?test=1` enables the hook (T-04-08, T-08-26).
    // Without the hook the traffic setting is the bundle's build-time default:
    // true in every deployed bundle, false in the browser-test bundles (WORLD-16).
    ctx.runtime.testFlags = parseTestFlags(
      window.location.search,
      __WEGOLITE_TRAFFIC_DEFAULT__,
    );
    ctx.runtime.testHookEnabled = ctx.runtime.testFlags.hook;
    // D-05/D-10: the world lifecycle carries the traffic setting parsed above
    // and the inert populator (Phase 12, D-01). It exists before the restore
    // branch, so a Continue and a launch both reach it. The populate closure
    // reads the NPC content and the layout at call time and never awaits, so
    // the lifecycle may be built before the boot load below finishes; the load
    // completes before the first `begin` or `resume` can run.
    ctx.core.worldLifecycle = createWorldLifecycle({
      traffic: ctx.runtime.testFlags.traffic,
      populate: createInertPopulate(
        () => ctx.core.npcTraffic,
        () => ctx.core.layout,
      ),
    });

    // D-09/T-06-12: every target id is resolved through this validated map.
    galaxyById.clear();
    for (const entry of galaxy) galaxyById.set(entry.id, entry);
    if (!galaxyById.has(ctx.core.system.id))
      galaxyById.set(ctx.core.system.id, ctx.core.system);

    const restore = options.restore;
    const restoring = restore !== undefined && options.fresh !== true;

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
    if (ctx.runtime.disposed) return;

    const catalogue = await loadShipCatalogue();

    if (ctx.runtime.disposed) return;

    // D-10/T-04-43: the equipment catalogue is the only source of a price and a
    // tech level. The commodity catalogue is the only source of the market
    // coefficients. A missing or malformed record fails the boot visibly,
    // exactly like the ship catalogue.
    try {
      // The NPC catalogue and the hull data join the same failure surface, and
      // only with traffic on: a traffic-off session never fetches either chunk
      // (WORLD-16, D-01). The hull chunk is the combat hit rule's input.
      const [
        equipment,
        loadedCommodities,
        loadedLabels,
        npcCatalogue,
        hullCatalogue,
      ] = await Promise.all([
        loadEquipment(),
        loadCommodities(),
        loadLabels(),
        ctx.runtime.testFlags.traffic
          ? loadNpcCatalogue()
          : Promise.resolve(undefined),
        ctx.runtime.testFlags.traffic
          ? loadShipHulls()
          : Promise.resolve(undefined),
      ]);
      if (ctx.runtime.disposed) return;
      ctx.core.npcTraffic =
        npcCatalogue === undefined ? undefined : trafficContent(npcCatalogue);
      ctx.core.hulls =
        hullCatalogue === undefined ? undefined : hullTable(hullCatalogue);
      ctx.core.equipmentCatalogue = equipment;
      ctx.core.commodities = loadedCommodities;
      ctx.core.labels = loadedLabels;
      ctx.core.commodityUnits = new Map(
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
    ctx.core.stationDef = station;
    ctx.core.stationKey = stationEntry.key;

    const flightConfig = deriveFlightConfig(playerDef);
    // SAVE-03/D-18: resolve the saved system before the first scene is built,
    // so a Continue never flashes Lave or builds the wrong layout.
    if (restoring && restore !== undefined) {
      const savedSystem = galaxyById.get(restore.system.id);
      if (savedSystem !== undefined) ctx.core.system = savedSystem;
    }
    // The graphics quality selects the planet's shader variant and the
    // atmosphere shell, so the settings are read before the first scene is
    // built; a Continue at High never flashes the Standard planet.
    const loaded = loadSettings();
    scenes.setQuality(loaded.quality);
    const nextScene = scenes.enterSystem(ctx.core.system, station);
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
      if (ctx.runtime.disposed) return;
      ctx.core.dockGeometry = createDockGeometry(
        rawDockPort,
        systemLayout.dockOffset,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showBootFailure(reason);
      publishFailure(reason);
      return;
    }

    if (!restoring) {
      // New game: the clear must commit before this promise resolves, so a
      // reload after the click cannot resurrect the old blob. A future blob is
      // never touched (T-04-47). It runs only here, after every load that can
      // fail has succeeded: a new game that cannot start must not have
      // deleted the save it was going to replace.
      await clearSaveForNewGame();
      if (ctx.runtime.disposed) return;
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

    ctx.core.state = flightState;
    // A pristine combat state beside every flight state: a new game and a
    // Continue both start with full shields and cool lasers (a combat state is
    // not saved).
    ctx.core.combat = createPlayerCombatState();
    ctx.core.layout = systemLayout;
    ctx.core.config = flightConfig;
    ctx.core.scene = nextScene;
    ctx.core.profile = restoredProfile ?? newProfile();
    // SAV-03/D-18: the committed target travels with the save. Only an id the
    // validated catalogue knows is installed (T-06-12).
    if (restoring && restore !== undefined) {
      const savedTarget = restore.targetSystem;
      ctx.core.hyperspaceTargetId =
        savedTarget !== undefined && galaxyById.has(savedTarget)
          ? savedTarget
          : undefined;
    }
    syncStatusOverlay();

    // D-17/D-18/D-19: resolve the seed once and generate the market once. A
    // later `docked` event reuses this market; only Phase 6's system change re-seeds.
    const loadedCatalogue = ctx.core.commodities ?? [];
    // Block-local alias for the pinned seed expression; read once, never kept.
    const { system } = ctx.core;
    ctx.core.marketSeed =
      restoring && restore !== undefined
        ? (restoredMarketSeed ?? marketSeedForSystem(system.id))
        : marketSeedForSystem(system.id);
    // D-18/SAVE-06: a saved snapshot is used verbatim; only a v1 migration or a
    // fresh game regenerates from the seed. Plan 06-04 owns the system swap.
    ctx.core.market =
      restoredMarket ??
      generateMarket(ctx.core.system, loadedCatalogue, ctx.core.marketSeed);
    // D-06: the cold Continue re-anchors the lifecycle at the saved epoch, in
    // the same position as the warm Load (after the seed install) and through
    // the same restoreWorldAnchor, so both give the same epoch and seed. An
    // in-flight Continue recreates the world from the resolved seed (RESEARCH
    // A9), without a bump; a docked restore keeps no world until the next
    // launch bumps the epoch, and a new game has no restore to anchor.
    if (restoring && restore !== undefined) {
      restoreWorldAnchor(
        ctx.core.worldLifecycle,
        restore.epoch,
        ctx.core.marketSeed,
        restoredInFlight,
      );
    }
    ensureSelection();
    ctx.runtime.hud = createHud(hudCanvas);
    ctx.runtime.hud.resize();
    ctx.runtime.breakPattern = createBreakPattern(hudCanvas);
    hudCanvas.hidden = true;
    ctx.chart.chart = createChart(document.body);
    ctx.chart.chart.setViewBuilder((viewport) =>
      buildChartView(
        galaxy,
        ctx.core.system.id,
        ctx.core.hyperspaceTargetId,
        ctx.chart.chartCamera,
        ctx.core.profile.fuel,
        viewport,
        ctx.chart.chartSelectedId,
      ),
    );
    ctx.chart.chart.setTooltipBuilder((id) => {
      const info = galaxyById.get(id);
      if (info === undefined || ctx.core.labels === undefined) return undefined;
      const model = buildSystemDataModel(
        info,
        ctx.core.system,
        ctx.core.labels,
      );
      return {
        title: info.name,
        fields: model.fields,
        description: model.description,
      };
    });
    ctx.chart.chart.onSelect((id) => {
      selectChartSystem(id);
    });
    ctx.chart.chart.onCamera((camera) => {
      setChartCamera(camera);
    });
    ctx.save.saveLoad = createSaveLoadScreen(document.body);
    ctx.save.saveLoad.onReturn(() => {
      closeSaveScreen();
    });
    ctx.save.saveLoad.onSave(() => {
      manualSave();
    });
    ctx.save.saveLoad.onLoad(() => {
      void loadFromSave();
    });
    ctx.save.saveLoad.onOverwriteConfirmed(() => {
      writeManualSave();
    });
    // A mouse Cancel closes the dialog on the screen alone; the session only
    // needs to publish the state the dialog now reports.
    ctx.save.saveLoad.onOverwriteCancelled(() => {
      probePublisher.updateProbe();
    });
    ctx.station.stationNav = createStationNav(document.body, {
      onNavigate: (id) => {
        navigateStation(id);
      },
      onStatusPage: (page) => {
        setStationPage(page);
      },
    });

    const bindingMap = createBindingMap(loaded.bindings);
    ctx.runtime.settings = { ...loaded, bindings: bindingMap };
    ctx.runtime.bindings = bindingMap;
    // Both overlay footers get their default hints before first open, and a
    // restored in-flight session (which never runs renderStation) still gets
    // the chart and Save/Load hint lines.
    refreshStationChrome();
    ctx.core.launchSeen = loaded.launchSeen;
    if (ctx.core.launchSeen) launchSequence.markSeen();
    ctx.runtime.hints = createHintController({
      bindings: bindingMap,
      seen: ctx.runtime.settings.hintsSeen,
      onSeen: (id) => {
        const currentSettings = ctx.runtime.settings;
        if (currentSettings === undefined) return;
        if (!currentSettings.hintsSeen.includes(id)) {
          currentSettings.hintsSeen.push(id);
        }
        persistSettings();
      },
    });

    ctx.runtime.input = createKeyboardInputSource(bindingMap);
    ctx.runtime.input.setStationScreenHandler((action) => {
      openStationScreen(action);
    });
    ctx.runtime.input.setContext(restoredInFlight ? "flight" : "dockHome");
    ctx.runtime.input.setPaused(false);
    ctx.runtime.input.attach();
    ctx.runtime.loop = createGameLoop();
    ctx.core.previousPose = poseOf(flightState);
    ctx.core.currentPose = ctx.core.previousPose;
    ctx.core.previousCameraWorld = undefined;

    ctx.runtime.pauseOverlay = createPauseOverlay({
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
    ctx.runtime.controlsPanel = createControlsPanel(bindingMap, {
      root: controlsRoot,
      onChange: (next) => {
        ctx.runtime.input?.setBindings(next);
        persistSettings();
        refreshStationChrome();
      },
      onReset: () => {
        resetAllSettings();
      },
      onBack: () => {
        backToPause();
      },
    });
    ctx.runtime.settingsPanel = createSettingsPanel({
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
      onPauseOnFocusLossChange: (enabled) => {
        if (ctx.runtime.settings === undefined) return;
        ctx.runtime.settings.pauseOnFocusLoss = enabled;
        persistSettings();
      },
      onQualityChange: (quality) => {
        if (ctx.runtime.settings === undefined) return;
        // Persist only what was applied; on failure the toggle snaps back.
        if (applyQuality(quality)) {
          ctx.runtime.settings.quality = quality;
          persistSettings();
        }
        syncQualityToggle();
      },
    });

    // The hook exists only when explicitly asked for with exactly `?test=1`
    // (read at the top of startSession), and only mutates the live state: no
    // save, no arbitrary code (T-04-08).
    if (ctx.runtime.testHookEnabled) probePublisher.bindTestHook(flightState);

    title.hide();
    if (restoredInFlight) {
      // The last visibility decision: the station overlay must never reappear
      // over an installed in-flight scene.
      docked.hide();
      hudCanvas.hidden = false;
      ctx.runtime.input.setContext("flight");
      // No station render runs on this path, so publish the live economy and
      // durable identities explicitly for the reload proof.
      probePublisher.syncEconomyProbe();
      // Written once, by the install block; updateProbe never touches it, so a
      // proof reads the pose the restore installed, not a resumed one.
      probe.restore = {
        mode: "inFlight",
        systemId: ctx.core.system.id,
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
      ctx.runtime.input.setContext("dockHome");
      docked.show(ctx.core.system.name);
      renderStation();
    }
    // The chart nav is hidden when the session boots in flight.
    syncStationNav();
    docked.onLaunch(() => {
      // D-03: the Launch button is only live on the home screen.
      if (
        ctx.core.state?.mode !== "docked" ||
        ctx.station.stationScreen !== "home"
      )
        return;
      pending.push({ kind: "launch" });
    });
    docked.onRefuel?.(() => {
      if (
        ctx.core.state?.mode !== "docked" ||
        ctx.station.stationScreen !== "home"
      )
        return;
      const catalogue = ctx.core.equipmentCatalogue;
      const fitCtx = fitContext();
      if (catalogue === undefined || fitCtx === undefined) return;
      const item = catalogue.find((entry) => entry.key === "EQ_FUEL");
      if (item === undefined) return;
      const check = checkFit(ctx.core.profile, item, fitCtx);
      if (!check.ok) return;
      const next = applyFit(ctx.core.profile, item, fitCtx);
      if (next === ctx.core.profile) return;
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "Tanks topped up to 7.0 LY";
      ctx.station.lastTrade = { kind: "fit", key: "EQ_FUEL", amount: 1 };
      commitProfile(next);
      autosave();
      renderStation();
    });

    renderFrame(0);
    ctx.runtime.rafId = requestAnimationFrame(frame);
  }

  function resize(): void {
    ctx.runtime.hud?.resize();
    // A resize clears both canvases, and the caller redraws only the scene.
    redrawGate.request();
  }

  /**
   * WORLD-04 test surface: rebuild the active system scene through the manager.
   *
   * The flight state and layout stay put: a swap replaces the scene graph, not
   * the simulation, and only the render references move. That is exactly the
   * ownership boundary the disposal proof is about.
   */
  function performSwap(): void {
    const currentStationDef = ctx.core.stationDef;
    if (ctx.core.state === undefined || currentStationDef === undefined) return;
    ctx.core.scene = scenes.enterSystem(ctx.core.system, currentStationDef);
    ctx.core.layout = scenes.layout() ?? ctx.core.layout;
    // The new dust field has no camera history; a stale delta would smear it.
    ctx.core.previousCameraWorld = undefined;
  }

  function disposeSystem(): void {
    scenes.disposeSystem();
    ctx.core.scene = undefined;
    ctx.core.previousCameraWorld = undefined;
  }

  /**
   * Swap, then settle one real frame so the GPU counters the probe reports
   * describe the new scene rather than the frame before it.
   *
   * The settlement frame is tracked in `ctx.runtime.swapRafId`, and a
   * `dispose()` that arrives before it fires cancels it and settles the wait
   * (`settleSwap`), so the continuation below never draws into a torn-down
   * session: it returns when the session is disposed.
   */
  let settleSwap: (() => void) | undefined;

  async function swapSystem(): Promise<void> {
    if (ctx.core.state === undefined) return;
    performSwap();
    renderFrame(0);
    await new Promise<void>((resolve) => {
      settleSwap = resolve;
      ctx.runtime.swapRafId = requestAnimationFrame(() => {
        ctx.runtime.swapRafId = 0;
        settleSwap = undefined;
        resolve();
      });
    });
    if (ctx.runtime.disposed) return;
    renderFrame(0);
  }

  /**
   * Teardown (WORLD-04, T-3-22): stop the loop, release every listener, clear
   * the HUD, then free the scene and the shared cache in that order.
   *
   * Teardown order, as it was in `createGameSession` before the split (each
   * step is a call or a write in `dispose` below, in this sequence):
   *   1. the `disposed` flag is set (a second call returns at once);
   *   2. the frame loop's animation frame is cancelled and `rafId` zeroed
   *      (new: the scene swap's settlement frame is cancelled and its wait
   *      settled right after, see `swapSystem`);
   *   3. the shared `uiController` is aborted (every window listener);
   *   4. the station nav, then the input source (cleared, then disposed), the
   *      pause overlay, the controls panel and the settings panel;
   *   5. the scene manager, then the asset cache that owns its shared GLBs;
   *   6. the break pattern, the HUD, the chart (chart closed), the Save/Load
   *      screen (screen closed), the docked shell and the title screen;
   *   7. the live state, scene and layout are dropped, then the world ends
   *      (plan 08-15);
   *   8. the probe publisher withdraws the test hook, save probe and Save/Load
   *      probe from the page object;
   *   9. the boot save store is disposed.
   *
   * Idempotent: `pagehide`, `webglcontextlost` and an explicit call may all
   * arrive for the same session. A second call must not double-free or throw.
   */
  function dispose(): void {
    if (ctx.runtime.disposed) return;
    ctx.runtime.disposed = true;

    if (ctx.runtime.rafId !== 0) cancelAnimationFrame(ctx.runtime.rafId);
    ctx.runtime.rafId = 0;
    // A scene swap still waiting for its settlement frame is cancelled and
    // released, so a late callback cannot draw into a disposed session.
    if (ctx.runtime.swapRafId !== 0)
      cancelAnimationFrame(ctx.runtime.swapRafId);
    ctx.runtime.swapRafId = 0;
    settleSwap?.();
    settleSwap = undefined;

    // Every listener this session added hangs off `uiController`; aborting it
    // also releases the sub-panel controllers' listeners through their own
    // disposers below.
    uiController.abort();
    ctx.station.stationNav?.dispose();
    ctx.station.stationNav = undefined;
    ctx.runtime.input?.clearAll();
    ctx.runtime.input?.dispose();
    ctx.runtime.pauseOverlay?.dispose();
    ctx.runtime.controlsPanel?.dispose();
    ctx.runtime.settingsPanel?.dispose();

    // Scene first, then the cache that owns the shared GLBs it referenced.
    scenes.dispose();
    assets.dispose();

    ctx.runtime.breakPattern?.dispose();
    ctx.runtime.hud?.dispose();
    ctx.chart.chart?.dispose();
    ctx.chart.chart = undefined;
    ctx.chart.chartOpen = false;
    ctx.save.saveLoad?.dispose();
    ctx.save.saveLoad = undefined;
    ctx.save.saveScreenOpen = false;
    docked.dispose();
    title.dispose();

    // Drop the live references so a late callback cannot read a disposed
    // scene, and withdraw the test surface with the session.
    ctx.core.state = undefined;
    ctx.core.combat = undefined;
    ctx.core.hulls = undefined;
    ctx.core.scene = undefined;
    ctx.core.layout = undefined;
    // The world dies with the live state; the epoch stays (plan 08-15).
    ctx.core.worldLifecycle?.end();
    probePublisher.withdrawProbe();
    saveBoot.store.dispose();
  }

  return {
    start,
    startSession,
    resize,
    performSwap,
    disposeSystem,
    swapSystem,
    dispose,
  };
}

export type SessionLifecycle = ReturnType<typeof createSessionLifecycle>;
