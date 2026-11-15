// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The typed session context (Phase 8, D-12 step 1, ARCHITECTURE.md section 4.1).
 *
 * Every mutable closure-level variable of `createGameSession` lives in one
 * `SessionState`, grouped by concern. A session module reads and writes a live
 * field through `ctx.<group>.<field>` at the moment it needs it, and never keeps
 * a copy of a live field beyond one call (G-8): the flight state, the scene and
 * the system are all replaced by a load or a jump, so a held copy would point at
 * a dead object.
 *
 * The immutable wiring (the options the session was built from, its queues and
 * its one-shot controllers) is `SessionDeps`; it never changes after
 * construction and is deliberately not part of `SessionState`.
 *
 * This module is types and one factory only: it holds no behaviour, so the
 * split steps that follow can move code without moving state. Its imports are
 * type-only except for the factories that build today's initial values.
 */

import type * as THREE from "three";
import type {
  Commodity,
  CommodityUnit,
  Equipment,
  Labels,
  ShipDef,
  System,
} from "../../content/types.js";
import type { DockFeedback } from "../dock-feedback.js";
import { createDockFeedback } from "../dock-feedback.js";
import type { GameLoop } from "../game-loop.js";
import type {
  GameSessionSave,
  SessionFaults,
  StationPending,
} from "../game-session.js";
import type { HintController } from "../hints.js";
import type { LaunchSequence } from "../launch-sequence.js";
import type {
  WegoliteHyperspaceLastJump,
  WegoliteLastTradeProbe,
  WegoliteProbe,
  WegoliteSaveProbe,
} from "../probe.js";
import type { RedrawGate } from "../redraw-gate.js";
import type { SceneManager } from "../scene-manager.js";
import type { TestFlags } from "./test-flags.js";
import type { TrafficContent } from "./traffic.js";
import type { WorldLifecycle } from "./world-lifecycle.js";
import type { KeyboardInputSource } from "../../input/keyboard.js";
import type { InputContext } from "../../input/actions.js";
import type { BindingMap } from "../../input/bindings.js";
import type { AssetCache } from "../../render/asset-cache.js";
import type { BreakPattern } from "../../render/break-pattern.js";
import type { Hud } from "../../render/hud/hud.js";
import type { HudModel } from "../../render/hud/draw.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import type { SystemScene } from "../../render/system-scene.js";
import type { SettingsV1 } from "../../settings/schema.js";
import type { SaveStatus } from "../../persistence/store.js";
import type { HullTable } from "../../sim/combat/hit.js";
import type { PlayerCombatState } from "../../sim/combat/state.js";
import type { Command } from "../../sim/commands.js";
import type { HyperspaceRefusal } from "../../sim/events.js";
import type { Market } from "../../sim/economy/market.js";
import type { DockGeometry } from "../../sim/dock/geometry.js";
import type { FlightConfig } from "../../sim/flight/config.js";
import type {
  PlayerController,
  ScriptedLaunchController,
} from "../../sim/flight/controller.js";
import type { FlightPose, FlightState } from "../../sim/flight/state.js";
import { identity, vec } from "../../sim/math.js";
import type { Vec3 } from "../../sim/math.js";
import type { PlayerProfile } from "../../sim/player/profile.js";
import { newProfile } from "../../sim/player/profile.js";
import type { InputFrame } from "../../sim/state.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import type { ChartOverlay } from "../../ui/chart.js";
import type { ChartCamera } from "../../ui/chart-model.js";
import { galaxyPreset } from "../../ui/chart-model.js";
import type { ControlsPanel } from "../../ui/controls.js";
import type { PauseOverlay } from "../../ui/pause.js";
import type { SaveLoadScreen } from "../../ui/save-load.js";
import type { SettingsPanel } from "../../ui/settings-panel.js";
import type { StationNav } from "../../ui/station-nav.js";
import type { StationScreen, StationShell } from "../../ui/station.js";
import type { TitleScreen } from "../../ui/title.js";

/** The weapon and ident message kinds that share the one-second gate. */
export const COMBAT_MESSAGE_KINDS = [
  "overheat",
  "noEnergy",
  "identEngaged",
  "identLocked",
  "identLost",
  "identOff",
] as const;

export type CombatMessageKind = (typeof COMBAT_MESSAGE_KINDS)[number];

/** The flight time each message kind last posted at, `null` before the first. */
export type CombatMessageTimes = Record<CombatMessageKind, number | null>;

/** A fresh table: every kind may post immediately. */
export function createCombatMessageTimes(): CombatMessageTimes {
  return {
    overheat: null,
    noEnergy: null,
    identEngaged: null,
    identLocked: null,
    identLost: null,
    identOff: null,
  };
}

/** The session's world: the live flight state and everything derived from it. */
export interface SessionCore {
  /** D-01: the system is mutable once a jump can install a new scene. */
  system: System;
  state: FlightState | undefined;
  layout: SystemLayout | undefined;
  config: FlightConfig | undefined;
  dockGeometry: DockGeometry | undefined;
  scene: SystemScene | undefined;
  stationDef: ShipDef | undefined;
  stationKey: string | undefined;
  equipmentCatalogue: readonly Equipment[] | undefined;
  commodities: readonly Commodity[] | undefined;
  labels: Labels | undefined;
  commodityUnits: ReadonlyMap<string, CommodityUnit>;
  /** Economy state lives beside the flight state, never inside it (D-10). */
  profile: PlayerProfile;
  lastDockClockDelta: number;
  /**
   * The profile's equipment as a set, rebuilt only when the list changes
   * (profiles are immutable, so the array identity is the cache key).
   */
  equipmentSetSource: readonly string[] | undefined;
  equipmentSetCache: ReadonlySet<string>;
  /** Market lifetime (D-17/D-18/D-19): generated once from the persisted seed. */
  market: Market | undefined;
  marketSeed: number | undefined;
  /** The committed hyperspace target; session state that travels in every save. */
  hyperspaceTargetId: string | undefined;
  lastJump: WegoliteHyperspaceLastJump | null;
  lastRefusal: { reason: HyperspaceRefusal } | null;
  previousPose: FlightPose;
  currentPose: FlightPose;
  previousCameraWorld: Vec3 | undefined;
  currentFrame: InputFrame;
  launchSeen: boolean;
  lastScrapeMessageTime: number | null;
  /**
   * When each combat or ident message kind last posted, so a held fire key
   * cannot flood the message line (OQ5, Pitfall 9). Cleared on Load, where the
   * flight clock is replaced.
   */
  lastCombatMessageTimes: CombatMessageTimes;
  /** Replaced, not cleared, on Load: a fresh instance drops both envelopes. */
  dockFeedback: DockFeedback;
  lastModel: HudModel | undefined;
  /**
   * The world lifecycle (plan 08-15): undefined until start-up creates it, then
   * read live by the sim driver and the lifecycle points. Never copied.
   */
  worldLifecycle: WorldLifecycle | undefined;
  /**
   * The NPC traffic content (plan 12-08): the populator records and the step's
   * ship masses. Loaded once at start-up, and only when traffic is on, so it is
   * undefined with traffic off and until the boot load has finished. Static
   * content: it holds no entity id and no world state, and it is read live by
   * the populate closure and by the sim driver.
   */
  npcTraffic: TrafficContent | undefined;
  /**
   * The player's combat state (CBT-04 to CBT-07): view, laser temperatures,
   * shields, energy and the ident. Created beside the flight state on a new
   * game, a Continue and a Load (a combat state is not saved, so a resumed game
   * starts pristine), carried across a hyperspace jump and cleared on dispose.
   * Simulation state only; it holds no entity id.
   */
  combat: PlayerCombatState | undefined;
  /**
   * The hull table for the hit rule (CBT-07, D-01), built from the lazily
   * loaded hull chunk. Loaded with the NPC catalogue and only with traffic on,
   * so it is undefined with traffic off and until the boot load has finished.
   * Static content keyed by spec key.
   */
  hulls: HullTable | undefined;
}

/** The station computer's own state; the UI is purely presentational. */
export interface SessionStationState {
  stationScreen: StationScreen;
  stationSelection: string;
  stationPending: StationPending;
  stationNotice: string;
  stationMessage: string;
  stationSaveNotice: string;
  stationPage: 1 | 2;
  /**
   * The laser key whose facing selection is open on F3, or null on the main
   * list (CBT-05). Cleared whenever the station screen changes.
   */
  outfittingFacingFor: string | null;
  lastTrade: WegoliteLastTradeProbe | null;
  stationNav: StationNav | undefined;
}

/** Navigation state (D-01/D-02/D-06); the chart freezes the loop. */
export interface SessionChartState {
  chart: ChartOverlay | undefined;
  chartOpen: boolean;
  /** D-01/D-06: one continuous camera; the local and galaxy views are presets. */
  chartCamera: ChartCamera;
  chartPreset: "local" | "galaxy";
  chartSelectedId: string | undefined;
  contextBeforeChart: InputContext;
}

/** The F2 Save/Load screen (D-20..D-23) and the autosave bookkeeping. */
export interface SessionSaveState {
  saveLoad: SaveLoadScreen | undefined;
  saveScreenOpen: boolean;
  contextBeforeSaveScreen: InputContext;
  saveScreenNotice: string;
  /** DOCK-07: the boot status is sticky for the session. */
  saveStatus: SaveStatus;
  saveRevision: number;
  saveAttempts: number;
  saveWrites: number;
  saveCommitted: number;
  saveCommittedRevision: number;
  saveLastClock: number | null;
  saveSkipReason: string;
  saveUnavailable: boolean;
  /** A manual Save is a single confirmed request; the flag coalesces a double-press. */
  manualSavePending: boolean;
  loadingSave: boolean;
}

/** Frame loop, input, overlays and the lifecycle flags. */
export interface SessionRuntime {
  hud: Hud | undefined;
  breakPattern: BreakPattern | undefined;
  input: KeyboardInputSource | undefined;
  loop: GameLoop | undefined;
  settings: SettingsV1 | undefined;
  bindings: BindingMap | undefined;
  hints: HintController | undefined;
  pauseOverlay: PauseOverlay | undefined;
  controlsPanel: ControlsPanel | undefined;
  settingsPanel: SettingsPanel | undefined;
  paused: boolean;
  /** QUAL-05: set from the context-loss event until the restore. */
  contextLost: boolean;
  /** Set by any accepted `?test=1` live-state mutation; autosave refuses a tainted profile. */
  testTainted: boolean;
  /** `?test=1` is read once at boot; a Load rebinds the hook only when enabled (G-8). */
  testHookEnabled: boolean;
  /**
   * The `?test=1` flag family, parsed once at start-up from the page URL
   * (D-10); the manual clock and the traffic setting read it from here.
   */
  testFlags: TestFlags;
  lastMs: number;
  rafId: number;
  /**
   * The id of the one animation frame `swapSystem` waits on (0 when none), so
   * `dispose()` can cancel it beside `rafId` (Phase 8, plan 08-12).
   */
  swapRafId: number;
  disposed: boolean;
  /** Set synchronously on the first `start()` call (`state` is assigned after two awaits). */
  starting: boolean;
}

/** Every mutable field of the session, grouped by concern (ARCHITECTURE.md 4.1). */
export interface SessionState {
  readonly core: SessionCore;
  readonly station: SessionStationState;
  readonly chart: SessionChartState;
  readonly save: SessionSaveState;
  readonly runtime: SessionRuntime;
}

/**
 * The immutable wiring `createGameSession` builds once. None of these values is
 * reassigned for the life of the session, so a module may hold them directly.
 */
export interface SessionDeps {
  readonly renderer: THREE.WebGLRenderer;
  readonly assets: AssetCache;
  readonly scenes: SceneManager;
  readonly title: TitleScreen;
  readonly docked: StationShell;
  readonly hudCanvas: HTMLCanvasElement;
  readonly probe: WegoliteProbe;
  readonly pauseRoot: HTMLElement;
  readonly controlsRoot: HTMLElement;
  readonly settingsRoot: HTMLElement;
  readonly gameRoot: HTMLElement;
  readonly saveBoot: GameSessionSave;
  readonly onProfileChanged: (profile: PlayerProfile) => void;
  /** D-18: test-only failure injection. */
  readonly faults: SessionFaults | undefined;
  readonly galaxy: readonly System[];
  readonly galaxyById: Map<string, System>;
  readonly player: PlayerController;
  readonly scripted: ScriptedLaunchController;
  readonly pending: Command[];
  readonly uiController: AbortController;
  readonly saveProbe: WegoliteSaveProbe;
  readonly redrawGate: RedrawGate;
  readonly messages: MessageQueue;
  readonly launchSequence: LaunchSequence;
}

/** What `createSessionState` needs: the boot system and the boot save status. */
export interface SessionStateInit {
  readonly system: System;
  readonly saveStatus: SaveStatus;
  /** The probe's short skip reason derived from `saveStatus`. */
  readonly saveSkipReason: string;
}

/**
 * Build the session state with today's initial values: nothing loaded, the home
 * station screen, the galaxy chart preset and the boot save status.
 */
export function createSessionState(init: SessionStateInit): SessionState {
  const previousPose: FlightPose = {
    position: vec(0, 0, 0),
    orientation: identity(),
  };
  return {
    core: {
      system: init.system,
      state: undefined,
      layout: undefined,
      config: undefined,
      dockGeometry: undefined,
      scene: undefined,
      stationDef: undefined,
      stationKey: undefined,
      equipmentCatalogue: undefined,
      commodities: undefined,
      labels: undefined,
      commodityUnits: new Map(),
      profile: newProfile(),
      lastDockClockDelta: 0,
      equipmentSetSource: undefined,
      equipmentSetCache: new Set(),
      market: undefined,
      marketSeed: undefined,
      hyperspaceTargetId: undefined,
      lastJump: null,
      lastRefusal: null,
      previousPose,
      currentPose: previousPose,
      previousCameraWorld: undefined,
      currentFrame: { pitch: 0, roll: 0, speed: 0, precision: false },
      launchSeen: false,
      lastScrapeMessageTime: null,
      lastCombatMessageTimes: createCombatMessageTimes(),
      dockFeedback: createDockFeedback(),
      lastModel: undefined,
      worldLifecycle: undefined,
      npcTraffic: undefined,
      combat: undefined,
      hulls: undefined,
    },
    station: {
      stationScreen: "home",
      stationSelection: "",
      stationPending: null,
      stationNotice: "",
      stationMessage: "",
      stationSaveNotice: "",
      stationPage: 1,
      outfittingFacingFor: null,
      lastTrade: null,
      stationNav: undefined,
    },
    chart: {
      chart: undefined,
      chartOpen: false,
      chartCamera: galaxyPreset(),
      chartPreset: "local",
      chartSelectedId: undefined,
      contextBeforeChart: "flight",
    },
    save: {
      saveLoad: undefined,
      saveScreenOpen: false,
      contextBeforeSaveScreen: "dockHome",
      saveScreenNotice: "",
      saveStatus: init.saveStatus,
      saveRevision: 0,
      saveAttempts: 0,
      saveWrites: 0,
      saveCommitted: 0,
      saveCommittedRevision: 0,
      saveLastClock: null,
      saveSkipReason: init.saveSkipReason,
      saveUnavailable: init.saveStatus === "unavailable",
      manualSavePending: false,
      loadingSave: false,
    },
    runtime: {
      hud: undefined,
      breakPattern: undefined,
      input: undefined,
      loop: undefined,
      settings: undefined,
      bindings: undefined,
      hints: undefined,
      pauseOverlay: undefined,
      controlsPanel: undefined,
      settingsPanel: undefined,
      paused: false,
      contextLost: false,
      testTainted: false,
      testHookEnabled: false,
      testFlags: { hook: false, manualClock: false, traffic: true },
      lastMs: 0,
      rafId: 0,
      swapRafId: 0,
      disposed: false,
      starting: false,
    },
  };
}
