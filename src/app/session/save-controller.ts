// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save controller (Phase 8, D-12 step 6, ARCHITECTURE.md section 4.2).
 *
 * Autosave, the manual Save, the in-session Load, the New-game clear and the F2
 * Save/Load screen. The bodies are the ones `createGameSession` carried before
 * the split, reading live fields through `ctx` at every call (G-8): the guard
 * order, the triggers and the bytes written do not change, because
 * `buildSnapshotInputs` still builds the one `SaveInputs` both producers use.
 *
 * Every collaborator `loadFromSave` calls arrives through `SaveControllerDeps`
 * (the save store through `saveBoot`, the message queue, the probe publisher's
 * functions, the station refresh functions, the scene entry), so a Node test
 * drives the real function with recording doubles. The controller registers no
 * listener on construction.
 *
 * Deliberate deviations from a verbatim move, all inert in normal play:
 * `closeSaveScreen` returns before touching `document` when there is none, and
 * the continuations of `clearSaveForNewGame` and of `queueSnapshot` return when
 * the session was disposed during their await (the post-read check in
 * `loadFromSave` already existed).
 */

import type { System } from "../../content/types.js";
import type { ActionId } from "../../input/actions.js";
import {
  profileFromSave,
  queueAutosave,
  restoreFromSave,
  snapshotForSave,
} from "../../persistence/autosave.js";
import { parseSave } from "../../persistence/save.js";
import type { SaveInputs, SaveParseFailure } from "../../persistence/save.js";
import type { SaveStatus } from "../../persistence/store.js";
import { formatClock } from "../../render/hud/format.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import {
  generateMarket,
  marketSeedForSystem,
} from "../../sim/economy/market.js";
import { poseOf } from "../../sim/flight/state.js";
import type { FlightState } from "../../sim/flight/state.js";
import { deriveSystemLayout } from "../../sim/world/layout.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import type { StationShell } from "../../ui/station.js";
import { createDockFeedback } from "../dock-feedback.js";
import type { GameSessionSave } from "../game-session.js";
import type { WegoliteProbe } from "../probe.js";
import type { SessionState } from "./context.js";
import { toTuple } from "./probe-publisher.js";

/** What the controller calls outside the session context. */
export interface SaveControllerDeps {
  /** The injected store port and the boot allow-lists; never IndexedDB directly. */
  readonly saveBoot: GameSessionSave;
  readonly galaxyById: ReadonlyMap<string, System>;
  readonly docked: Pick<StationShell, "show" | "hide">;
  readonly hudCanvas: Pick<HTMLCanvasElement, "hidden">;
  /** The page probe; a Load publishes `probe.restore` once. */
  readonly probe: Pick<WegoliteProbe, "restore">;
  readonly messages: Pick<MessageQueue, "clear">;
  /** Resolve and install a destination system scene; throws before any switch. */
  readonly enterSystemById: (id: string) => SystemLayout;
  /** The global `#status` overlay naming the live system. */
  readonly syncStatusOverlay: () => void;
  readonly renderFrame: (alpha: number) => void;
  readonly renderStation: () => void;
  readonly syncStationNav: () => void;
  readonly ensureSelection: () => void;
  /** The probe publisher's functions (G-8: the hook rebinds on a Load). */
  readonly updateProbe: () => void;
  readonly syncSaveProbe: () => void;
  readonly syncEconomyProbe: () => void;
  readonly bindTestHook: (activeState: FlightState) => void;
}

export function isStoreUnavailable(reason: string | undefined): boolean {
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
export function canOverwrite(status: SaveStatus): boolean {
  return status === "absent" || status === "valid";
}

/**
 * Only a blob this build positively understands may be deleted. A corrupt
 * v1-shaped blob is eligible (boot already copied it aside); `future`,
 * `unreadable` and `unavailable` are not.
 */
export function canClear(status: SaveStatus): boolean {
  return status === "absent" || status === "valid" || status === "corrupt";
}

/** The probe's short reason for a skipped autosave or clear. */
export function statusSkipReason(status: SaveStatus): string {
  if (status === "future") return "future";
  if (status === "unreadable") return "unreadable";
  if (status === "unavailable") return "unavailable";
  // A corrupt blob is recognised but not overwritable (`canOverwrite`), so
  // its reason must be visible rather than silently blank.
  if (status === "corrupt") return "corrupt";
  return "";
}

export function createSaveController(
  ctx: SessionState,
  deps: SaveControllerDeps,
) {
  const {
    saveBoot,
    galaxyById,
    docked,
    hudCanvas,
    probe,
    messages,
    enterSystemById,
    syncStatusOverlay,
    renderFrame,
    renderStation,
    syncStationNav,
    ensureSelection,
    updateProbe,
    syncSaveProbe,
    syncEconomyProbe,
    bindTestHook,
  } = deps;

  /** Publish one app-owned save notice on the F2 screen and station footer. */
  function setSaveNotice(text: string): void {
    ctx.save.saveScreenNotice = text;
    ctx.station.stationSaveNotice = text;
    ctx.save.saveLoad?.setNotice(text);
    syncSaveProbe();
  }

  /**
   * Build the one schema input set used by both the autosave anchors and the
   * manual F2 Save, so the two producers can never diverge (D-21).
   */
  function buildSnapshotInputs(): SaveInputs | undefined {
    const currentState = ctx.core.state;
    const currentStationKey = ctx.core.stationKey;
    const currentMarket = ctx.core.market;
    const catalogue = ctx.core.commodities;
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
      ctx.core.profile,
      ctx.core.system,
      { key: currentStationKey },
      currentMarket,
      catalogue,
      ctx.core.hyperspaceTargetId,
    );
  }

  /**
   * Encode and queue one snapshot on the one serialized revision queue. The
   * probe only publishes a committed revision, clock and notice when the
   * transaction completes.
   */
  function queueSnapshot(inputs: SaveInputs, manual: boolean): void {
    ctx.save.saveRevision += 1;
    const revision = ctx.save.saveRevision;
    ctx.save.saveWrites += 1;
    ctx.save.saveSkipReason = "";
    syncSaveProbe();
    // The frame loop never awaits this; `queueAutosave` cannot reject.
    void queueAutosave(saveBoot.store, revision, inputs, saveBoot.allow).then(
      (result) => {
        // Disposed while the write was in flight: touch nothing (T-08-42).
        if (ctx.runtime.disposed) return;
        if (manual) ctx.save.manualSavePending = false;
        if (result.committed) {
          ctx.save.saveCommitted += 1;
          ctx.save.saveCommittedRevision = revision;
          ctx.save.saveLastClock = inputs.clockSeconds;
          ctx.save.saveStatus = "valid";
          ctx.save.saveSkipReason = "";
          if (manual) {
            setSaveNotice(`Saved at ${formatClock(inputs.clockSeconds)}`);
          } else {
            ctx.station.stationSaveNotice = "";
          }
        } else if (isStoreUnavailable(result.reason)) {
          ctx.save.saveUnavailable = true;
          ctx.save.saveSkipReason = result.reason ?? "";
          if (manual) setSaveNotice("Save failed — progress not saved");
          else
            ctx.station.stationSaveNotice = "Save failed — progress not saved";
        } else {
          // A rejected snapshot (invalid-save) or a store failure is visible
          // but non-blocking: the in-memory session remains playable.
          ctx.save.saveSkipReason = result.reason ?? "";
          if (manual) setSaveNotice("Save failed — progress not saved");
          else
            ctx.station.stationSaveNotice = "Save failed — progress not saved";
        }
        syncSaveProbe();
        if (!ctx.runtime.disposed) {
          renderStation();
          if (ctx.save.saveScreenOpen)
            ctx.save.saveLoad?.setSlot(saveSlotText());
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
    ctx.save.saveAttempts += 1;
    // QUAL-05 (T-07-05): no write while the context is lost, before any other
    // guard, and never a queued snapshot (research Pitfall 9).
    if (ctx.runtime.contextLost) {
      ctx.save.saveSkipReason = "recovering";
      syncSaveProbe();
      return;
    }
    if (!canOverwrite(ctx.save.saveStatus)) {
      ctx.save.saveSkipReason = statusSkipReason(ctx.save.saveStatus);
      syncSaveProbe();
      return;
    }
    if (ctx.runtime.testTainted) {
      ctx.save.saveSkipReason = "tainted";
      syncSaveProbe();
      return;
    }
    const inputs = buildSnapshotInputs();
    if (inputs === undefined) {
      ctx.save.saveSkipReason = "not-ready";
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
    ctx.save.saveAttempts += 1;
    // QUAL-05 (T-07-05): the same recovery guard as autosave, ahead of every
    // other check, so a lost context can never reach queueSnapshot.
    if (ctx.runtime.contextLost) {
      ctx.save.saveSkipReason = "recovering";
      syncSaveProbe();
      return;
    }
    if (ctx.save.manualSavePending) {
      setSaveNotice("Save already in progress");
      return;
    }
    if (!canOverwrite(ctx.save.saveStatus)) {
      ctx.save.saveSkipReason = statusSkipReason(ctx.save.saveStatus);
      setSaveNotice("Saving is disabled — this save is read-only");
      return;
    }
    if (ctx.runtime.testTainted) {
      ctx.save.saveSkipReason = "tainted";
      setSaveNotice("Save skipped — test changes are not saved");
      return;
    }
    if (ctx.save.saveStatus === "valid") {
      // The committed slot is the only save: ask before replacing it. The
      // dialog's own state is the only gate, so a second Save while it is open
      // does nothing, and a Cancel that closed it leaves the next Save live.
      if (ctx.save.saveLoad?.isConfirming() !== true) {
        ctx.save.saveLoad?.confirmOverwrite();
        updateProbe();
      }
      return;
    }
    writeManualSave();
  }

  /** The confirmed (or absent-slot) manual write; never asks again. */
  function writeManualSave(): void {
    ctx.save.saveLoad?.cancelOverwrite();
    updateProbe();
    const inputs = buildSnapshotInputs();
    if (inputs === undefined) {
      ctx.save.saveSkipReason = "not-ready";
      setSaveNotice("Save failed — the game is not ready");
      return;
    }
    ctx.save.manualSavePending = true;
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
    const currentInput = ctx.runtime.input;
    const currentStationDef = ctx.core.stationDef;
    const catalogue = ctx.core.commodities;
    if (
      ctx.save.loadingSave ||
      !ctx.save.saveScreenOpen ||
      currentInput === undefined ||
      currentStationDef === undefined ||
      catalogue === undefined
    ) {
      return;
    }
    ctx.save.loadingSave = true;
    try {
      const read = await saveBoot.store.read();
      // G-8: F2 may have been closed during the IndexedDB await. A closed
      // screen must not be overwritten by a save the player walked away from.
      if (ctx.runtime.disposed || !ctx.save.saveScreenOpen) return;
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

      // enterSystemById derives the destination layout before the scene manager
      // switches, so a failure there is caught and leaves the origin scene and
      // the session untouched. The scene manager installs the new scene before
      // it retires the old one, and a retire failure is logged there, not thrown.
      let nextLayout: SystemLayout;
      try {
        nextLayout = enterSystemById(saved.system.id);
      } catch {
        failLoad("Save could not be loaded");
        return;
      }

      // One synchronous install block: no early return after this point.
      ctx.core.state = restored.state;
      ctx.core.layout = nextLayout;
      ctx.core.profile = restored.profile;
      ctx.core.market = nextMarket;
      ctx.core.marketSeed = nextSeed;
      ctx.core.hyperspaceTargetId = nextTarget;
      syncStatusOverlay();
      // G-8: nothing from the replaced session may outlive the Load. The
      // message queue is keyed to the old flight clock, so a stale line would
      // survive the restored clock; the dock envelopes and scrape throttle are
      // keyed the same way. A fresh feedback instance drops both envelopes.
      messages.clear();
      ctx.core.lastScrapeMessageTime = null;
      ctx.core.dockFeedback = createDockFeedback();
      if (ctx.runtime.testHookEnabled) bindTestHook(restored.state);
      ctx.core.previousPose = poseOf(restored.state);
      ctx.core.currentPose = ctx.core.previousPose;
      ctx.core.previousCameraWorld = undefined;
      ctx.station.stationScreen = "home";
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "";
      ctx.station.stationMessage = "";
      ctx.station.stationPage = 1;
      ctx.chart.chartSelectedId = undefined;
      ctx.station.lastTrade = null;
      ctx.chart.chartOpen = false;
      ctx.chart.chart?.hide();
      ctx.save.saveScreenOpen = false;
      ctx.save.manualSavePending = false;
      ctx.save.saveScreenNotice = "";
      ctx.save.saveLoad?.cancelOverwrite();
      ctx.save.saveLoad?.hide();
      ctx.save.saveStatus = "valid";
      ctx.save.saveLastClock = saved.clockSeconds;
      ctx.save.saveSkipReason = "";
      const restoredDocked = restored.state.mode === "docked";
      currentInput.setContext(restoredDocked ? "dockHome" : "flight");
      if (restoredDocked) {
        docked.show(ctx.core.system.name);
        hudCanvas.hidden = true;
        ensureSelection();
        renderStation();
      } else {
        docked.hide();
        hudCanvas.hidden = false;
        syncEconomyProbe();
      }
      syncStationNav();
      // Publish the installed pose once, exactly like the boot restore, so a
      // proof reads the saved numbers and not a resumed simulation.
      probe.restore = {
        mode: restoredDocked ? "docked" : "inFlight",
        systemId: ctx.core.system.id,
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
      ctx.runtime.loop?.reset();
      ctx.runtime.lastMs = 0;
      renderFrame(0);
    } finally {
      ctx.save.loadingSave = false;
    }
  }

  /**
   * New game clears only a save this build understands. A future, unreadable,
   * unavailable or otherwise unknown blob is left byte-identical (WR-04,
   * D-14/T-04-47) and the write path stays disabled.
   */
  async function clearSaveForNewGame(): Promise<void> {
    if (!canClear(ctx.save.saveStatus)) {
      ctx.save.saveSkipReason = statusSkipReason(ctx.save.saveStatus);
      syncSaveProbe();
      return;
    }
    ctx.save.saveRevision += 1;
    const currentRevision = ctx.save.saveRevision;
    const result = await saveBoot.store.clear(currentRevision);
    // Disposed while the clear was in flight: touch nothing (T-08-42).
    if (ctx.runtime.disposed) return;
    if (result.committed) {
      ctx.save.saveStatus = "absent";
      ctx.save.saveSkipReason = "";
    } else if (isStoreUnavailable(result.reason)) {
      ctx.save.saveUnavailable = true;
    }
    syncSaveProbe();
  }

  /** The one slot line: the autosave key, the system and the live clock. */
  function saveSlotText(): string {
    const clock =
      ctx.core.state === undefined
        ? ""
        : formatClock(ctx.core.state.clockSeconds);
    return `Autosave · ${ctx.core.system.name} · ${clock}`;
  }

  /**
   * D-20: F2 opens the standalone screen only while docked. The keyboard only
   * dispatches F2 from `dockHome`/`dockScreen`; this revalidates the live mode,
   * the pause overlay and the chart, so no overlay can open over another one.
   */
  function openSaveScreen(): void {
    const currentState = ctx.core.state;
    const currentInput = ctx.runtime.input;
    const screen = ctx.save.saveLoad;
    if (
      currentState === undefined ||
      currentInput === undefined ||
      screen === undefined
    ) {
      return;
    }
    if (ctx.runtime.paused || ctx.save.saveScreenOpen || ctx.chart.chartOpen)
      return;
    if (currentState.mode !== "docked") return;
    ctx.save.saveScreenOpen = true;
    ctx.save.contextBeforeSaveScreen = currentInput.getContext();
    currentInput.setContext("saveScreen");
    syncStationNav();
    screen.show(saveSlotText());
    ctx.save.saveScreenNotice = canOverwrite(ctx.save.saveStatus)
      ? ""
      : "Saving is disabled — this save is read-only";
    screen.setNotice(ctx.save.saveScreenNotice);
    updateProbe();
  }

  /** Hide F2 and restore the station context the player left. */
  function closeSaveScreen(): void {
    if (!ctx.save.saveScreenOpen) return;
    ctx.save.saveScreenOpen = false;
    ctx.save.saveLoad?.cancelOverwrite();
    ctx.save.saveLoad?.hide();
    ctx.runtime.input?.setContext(ctx.save.contextBeforeSaveScreen);
    // Return focus to the station screen the input context just restored.
    if (typeof document !== "undefined") {
      const stationScreenElement = document.getElementById("station-screen");
      stationScreenElement?.focus({ preventScroll: true });
    }
    syncStationNav();
    updateProbe();
  }

  /**
   * Apply one drained F2-screen edge. The live open flag is revalidated here so
   * a queued action cannot act on a screen the player already closed.
   */
  function applySaveScreenAction(action: ActionId): void {
    const screen = ctx.save.saveLoad;
    if (screen === undefined) return;
    switch (action) {
      case "saveLoad":
        if (ctx.save.saveScreenOpen) closeSaveScreen();
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
        if (ctx.save.saveScreenOpen && !screen.isConfirming())
          screen.moveSelection(-1);
        break;
      case "saveScreenDown":
        if (ctx.save.saveScreenOpen && !screen.isConfirming())
          screen.moveSelection(1);
        break;
      case "saveScreenSave":
        if (ctx.save.saveScreenOpen && !screen.isConfirming()) manualSave();
        break;
      case "saveScreenActivate":
        // Enter follows focus: on the open dialog it resolves whichever
        // control holds focus, so a focused Cancel never overwrites.
        if (!ctx.save.saveScreenOpen) break;
        if (screen.isConfirming()) screen.confirmFocused();
        else screen.activate();
        break;
      case "saveScreenConfirm":
        // Y is the direct confirm and confirms regardless of focus.
        if (!ctx.save.saveScreenOpen) break;
        if (screen.isConfirming()) screen.acceptOverwrite();
        else screen.activate();
        break;
      case "saveScreenCancel":
        if (ctx.save.saveScreenOpen && screen.isConfirming()) {
          screen.cancelOverwrite();
          updateProbe();
        }
        break;
      case "saveScreenLoad":
        if (ctx.save.saveScreenOpen && !screen.isConfirming())
          void loadFromSave();
        break;
      default:
        break;
    }
  }

  function handleSaveScreenActions(actions: readonly ActionId[]): void {
    for (const action of actions) applySaveScreenAction(action);
  }

  return {
    setSaveNotice,
    buildSnapshotInputs,
    queueSnapshot,
    autosave,
    manualSave,
    writeManualSave,
    loadFailureCopy,
    failLoad,
    loadFromSave,
    clearSaveForNewGame,
    saveSlotText,
    openSaveScreen,
    closeSaveScreen,
    applySaveScreenAction,
    handleSaveScreenActions,
  };
}

/** The save controller's public surface, derived from the factory. */
export type SaveController = ReturnType<typeof createSaveController>;
