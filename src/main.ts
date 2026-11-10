// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/// <reference types="vite/client" />

/**
 * Boot (D-09, D-15, T-3-02, T-3-19, Pitfall 14).
 *
 * The order is load-bearing and lives in `bootApp`:
 *
 * 1. validate the content manifest — a `ContentBoundaryError` must throw before
 *    the renderer exists, so it is never confused with a rendering failure;
 * 2. build the renderer and verify it really is WebGL2;
 * 3. install the menu scene and publish a `mode: "menu"` probe;
 * 4. hand the rest to `GameSession`, which loads both GLBs before its first
 *    frame and owns the flight loop.
 *
 * A renderer/context failure never reaches step 3: `showWebgl2Fallback` shows
 * the visible `#failure` surface, publishes `ready: false`, and this module
 * returns before any scene, HUD or RAF exists.
 */

// First on purpose: zod must run without JIT before any schema is built below.
import "./app/zod-csp.js";
import { bootApp } from "./app/boot.js";
import { showBootFailure } from "./app/boot-failure.js";
import { showWebgl2Fallback } from "./app/fallback.js";
import {
  CONTEXT_RESTORE_FAILURE_COPY,
  CONTEXT_RESTORE_TIMEOUT_MS,
  createContextRecovery,
} from "./app/context-recovery.js";
import { createGameSession } from "./app/game-session.js";
import type { SessionFaults } from "./app/game-session.js";
import { publishFailure, publishProbe, readMemory } from "./app/probe.js";
import type { WegoliteProbe } from "./app/probe.js";
import { createSceneManager } from "./app/scene-manager.js";
import manifest from "./content/generated/manifest.json";
import { loadCommodities } from "./content/commodities.js";
import { loadEquipment } from "./content/equipment.js";
import { loadShipCatalogue } from "./content/ships.js";
import { LAZY_GALAXY_COUNT, galaxy0 } from "./content/systems.js";
import { createIndexedDbSaveStore } from "./persistence/idb-store.js";
import { parseSave } from "./persistence/save.js";
import type { SaveAllowLists, SaveV2 } from "./persistence/save.js";
import type { SaveStatus } from "./persistence/store.js";
import { createAssetCache } from "./render/asset-cache.js";
import { applyViewport } from "./render/viewport.js";
import { createDockedPanel } from "./ui/docked.js";
import { createStationShell } from "./ui/station.js";
import { createTitleScreen, shouldConfirmNewGame } from "./ui/title.js";

/**
 * D-18: a compile-time switch. Vite's `define` replaces this identifier with a
 * literal at build time: `false` in every shipped build (vite.config.ts), `true`
 * only in the test-only build (vite.seams.config.ts). In the shipped bundle the
 * guarded read below is dead code and is removed entirely.
 */
declare const __WEGOLITE_TEST_SEAMS__: boolean;

/**
 * Read the test-only fault global. It accepts exactly one shape,
 * `{ failDestinationBuild: true }`; any other value yields no faults (T-07-20).
 * It never reads the URL.
 */
function readSessionFaults(target: Window): SessionFaults | undefined {
  const value: unknown = Reflect.get(target, "__wegoliteFaults");
  if (typeof value !== "object" || value === null) return undefined;
  if (!Object.hasOwn(value, "failDestinationBuild")) return undefined;
  const failDestinationBuild: unknown = Reflect.get(
    value,
    "failDestinationBuild",
  );
  return failDestinationBuild === true
    ? { failDestinationBuild: true }
    : undefined;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      `Wegolite: expected an element with id "${id}", but it is missing.`,
    );
  }
  return element;
}

function requireCanvas(id: string): HTMLCanvasElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLCanvasElement)) {
    throw new Error(
      `Wegolite: expected a <canvas id="${id}"> in the document, but it is missing or is not a canvas element.`,
    );
  }
  return element;
}

/**
 * Measure the fixed document disclaimer so every station overlay can reserve
 * exactly its height. The CSS fallback keeps the strip reserved until this
 * runs; the observer keeps it exact when the text wraps at a different width.
 */
function trackDocumentFooterHeight(signal: AbortSignal): void {
  const footer = document.querySelector<HTMLElement>("body > footer");
  if (footer === null) return;
  const root = document.documentElement;
  const sync = (): void => {
    root.style.setProperty(
      "--document-footer-height",
      `${footer.getBoundingClientRect().height}px`,
    );
  };
  const observer = new ResizeObserver(sync);
  observer.observe(footer);
  signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  sync();
}

const canvas = requireCanvas("view");
const boot = await bootApp({ manifest, canvas });

if (!boot.ok) {
  // T-3-19: one visible explanation, `ready: false`, and nothing scheduled.
  showWebgl2Fallback(boot.reason);
} else {
  const renderer = boot.renderer;
  const gl = renderer.getContext();
  const depthBits = gl.getParameter(gl.DEPTH_BITS) as number;

  const hudCanvas = requireCanvas("hud");
  const assets = createAssetCache();
  const scenes = createSceneManager(renderer, assets);
  scenes.enterMenu();

  let stopped = false;
  // One controller owns every listener this module adds, so `pagehide` can
  // release them in a single abort (T-3-22). `resize` is registered through it
  // below, before the first render.
  const lifecycle = new AbortController();
  trackDocumentFooterHeight(lifecycle.signal);

  // The title scene needs the shared Cobra, which only exists once the GLBs
  // have loaded. Warm the cache in the background so the menu becomes a real
  // scene on every load. A failure is deliberately swallowed here: the session
  // awaits the same memoised promise and owns the visible failure surface.
  void assets
    .preload()
    .then(() => {
      // Never fight a system scene the player already entered, and never
      // rebuild after teardown.
      if (!stopped && scenes.layout() === undefined) scenes.enterMenu();
    })
    .catch(() => {
      // Reported by `session.start()`.
    });

  const title = createTitleScreen(requireElement("title-screen"));
  const dockedRoot = requireElement("docked");
  const station = createStationShell(dockedRoot, createDockedPanel(dockedRoot));
  const pauseRoot = requireElement("pause");
  const controlsRoot = requireElement("controls");
  const settingsRoot = requireElement("settings-panel");

  const lave = galaxy0().find((system) => system.id === "g0-s7");
  if (lave === undefined) {
    throw new Error('Wegolite: galaxy 0 has no Lave record ("g0-s7").');
  }

  // D-14: read the one save before offering anything. Every allow-list is built
  // at this call site from validated sources (T-04-50): the equipment
  // catalogue, galaxy 0's system ids and the catalogue entries that actually
  // carry a dock subentity. A forged key can therefore never reach `findShip`.
  const saveStore = createIndexedDbSaveStore();
  let saveStatus: SaveStatus;
  let bootSave: SaveV2 | undefined;
  let allowLists: SaveAllowLists = {
    equipment: new Set(),
    systems: new Set(),
    stations: new Set(),
    commodities: new Map(),
    marketGoods: new Set(),
  };
  try {
    const [equipment, catalogue, commodities] = await Promise.all([
      loadEquipment(),
      loadShipCatalogue(),
      loadCommodities(),
    ]);
    allowLists = {
      equipment: new Set(equipment.map((item) => item.key)),
      systems: new Set(galaxy0().map((system) => system.id)),
      stations: new Set(
        catalogue
          .filter((entry) =>
            entry.shipDef.subentities.some(
              (subentity) => subentity.isDock === true,
            ),
          )
          .map((entry) => entry.key),
      ),
      // Only tradeable goods can be persisted; Alien Items is visible but
      // never held, so it is deliberately absent from the cargo allow-list.
      commodities: new Map(
        commodities
          .filter((item) => item.tradeable && item.key !== "alien_items")
          .map((item) => [item.key, item.unit]),
      ),
      // D-15/Pitfall 3: the market snapshot carries all 17 goods including
      // Alien Items. It must not be derived from the 16-key cargo map, or every
      // v2 save would be rejected as corrupt on the next reload.
      marketGoods: new Set(commodities.map((item) => item.key)),
    };
    const read = await saveStore.read();
    if (read.kind === "ok") {
      const parsed = parseSave(read.raw, allowLists);
      if (parsed.ok) {
        saveStatus = "valid";
        bootSave = parsed.save;
      } else if (parsed.reason === "future-version") {
        // A newer build owns this blob; this build never clears or replaces it.
        saveStatus = "future";
      } else if (parsed.reason === "corrupt") {
        saveStatus = "corrupt";
        // Exactly once, best effort, before the title: the copy is never read
        // back and a failure must not block boot. `corrupt` is only returned
        // for a provably v1-shaped blob, so the copy is bounded by the parser.
        await saveStore.backupCorrupt(read.raw).catch(() => undefined);
      } else if (parsed.reason === "unreadable") {
        // Oversized, unparseable or unknown-shape blob: this build cannot
        // positively identify it, so it is untouchable. No backup, no clear,
        // no autosave overwrite (T-04-47).
        saveStatus = "unreadable";
      } else {
        saveStatus = "absent";
      }
    } else if (read.kind === "absent") {
      saveStatus = "absent";
    } else {
      // A read failure (non-string stored value, transaction error) is not
      // proof of absence: the blob may be a valid save this boot could not
      // decode. Keep `unavailable`, which New game and autosave both treat as
      // untouchable (WR-04).
      saveStatus = "unavailable";
    }
  } catch {
    // A broken catalogue fails `session.start` visibly. Here it only means no
    // save can be trusted, so the title starts fresh without offering Continue.
    saveStatus = "unavailable";
  }

  const probe: WegoliteProbe = {
    ready: true,
    calls: 0,
    triangles: 0,
    logDepth: renderer.capabilities.logarithmicDepthBuffer,
    depthBits,
    webgl2: true,
    renders: 0,
    frames: 0,
    // D-14: galaxy 0 is eager, so it is in this bundle; g1-g7 are code-split.
    homeSystems: galaxy0().length,
    codeSplitGalaxies: LAZY_GALAXY_COUNT,
    messages: 0,
    mode: "menu",
    paused: false,
    clock: 0,
    flightTime: 0,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    speed: 0,
    angular: { pitch: 0, roll: 0 },
    torus: { engaged: false, factor: 1, massLocked: false },
    hud: {
      drawn: false,
      elements: [],
      designScale: 1,
      letterbox: [0, 0],
      contacts: [],
      compass: { target: "planet", forward: false },
      aegis: "none",
      message: "",
      fuelText: "",
      fuel: 0,
      bounds: {},
    },
    launch: { count: 0, elapsed: 0, seen: false },
    memory: { geometries: 0, textures: 0, programs: 0 },
    bodies: [],
    recovery: { state: "live", losses: 0, restores: 0 },
  };

  const sessionFaults = __WEGOLITE_TEST_SEAMS__
    ? readSessionFaults(window)
    : undefined;
  const session = createGameSession({
    renderer,
    assets,
    scenes,
    title,
    docked: station,
    hudCanvas,
    probe,
    system: lave,
    galaxy: galaxy0(),
    pauseRoot,
    controlsRoot,
    settingsRoot,
    gameRoot: canvas,
    save: {
      store: saveStore,
      status: saveStatus,
      ...(bootSave === undefined ? {} : { save: bootSave }),
      allow: allowLists,
    },
    ...(sessionFaults === undefined ? {} : { faults: sessionFaults }),
  });

  function stopSession(): void {
    if (stopped) return;
    stopped = true;
    session.dispose();
  }

  function renderActiveScene(): void {
    const active = scenes.active();
    renderer.render(active.scene, active.camera);
    probe.calls = renderer.info.render.calls;
    probe.triangles = renderer.info.render.triangles;
    probe.renders = renderer.info.render.frame;
    probe.memory = readMemory(renderer);
  }

  function resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // A minimised or hidden window reports a zero dimension; resizing to it
    // would compute an Infinity aspect and an empty drawing buffer.
    if (width === 0 || height === 0) return;
    renderer.setSize(width, height, false);
    // `applyViewport` is the single writer of `camera.aspect`; the manager uses
    // it on every scene install, and this is the resize path.
    applyViewport(scenes.active().camera, { width, height });
    // Before a session exists this is the only frame that publishes the live
    // aspect; `renderFrame` takes over once the system scene is installed.
    probe.aspect = scenes.active().camera.aspect;
    session.resize();
    renderActiveScene();
  }

  window.addEventListener("resize", resize, { signal: lifecycle.signal });
  resize();

  // Published after the first render so `ready` implies the probe's numbers are
  // real.
  publishProbe(probe);

  title.setContinueVisible(bootSave !== undefined);
  if (probe.save !== undefined) {
    probe.save.continueVisible = bootSave !== undefined;
  }
  // G-04-3: the title asks before New game discards a save this build can
  // clear. A fresh boot, or an untouchable status, keeps the one-click path.
  title.setNewGameConfirmationRequired(shouldConfirmNewGame(saveStatus));

  const continueSave = bootSave;
  title.onStart(() => {
    void session.start();
  });
  if (continueSave !== undefined) {
    title.onContinue(() => {
      void session.start({ restore: continueSave, fresh: false });
    });
  }

  // D-15: focus loss (window blur or a hidden tab) always clears held input.
  // It pauses the game only when the player's pause-on-focus-loss setting is
  // on, which is the default. With the setting off the simulation keeps
  // running. On the title/menu there is no simulation, so only input clears.
  // Pointer-lock and fullscreen changes clear input even while paused.
  const focusController = new AbortController();
  const focusOptions: AddEventListenerOptions = {
    signal: focusController.signal,
  };

  window.addEventListener(
    "blur",
    () => {
      session.focusLost();
    },
    focusOptions,
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") session.focusLost();
      else session.shown();
    },
    focusOptions,
  );
  document.addEventListener(
    "pointerlockchange",
    () => {
      session.clearInput();
    },
    focusOptions,
  );
  document.addEventListener(
    "fullscreenchange",
    () => {
      session.clearInput();
    },
    focusOptions,
  );

  // QUAL-05 (D-15, D-16): a lost context pauses and waits for the browser to
  // restore it; the player resumes by action. Only a restore that never comes
  // (10 s) reaches the failure surface, and the save is never written meanwhile.
  // The state machine is DOM-free (context-recovery.ts); this module wires it.
  const recovery = createContextRecovery({
    timeoutMs: CONTEXT_RESTORE_TIMEOUT_MS,
    schedule: (callback, ms) => window.setTimeout(callback, ms),
    cancel: (handle) => window.clearTimeout(handle),
    onLost: () => {
      session.enterContextLoss();
      probe.recovery = {
        state: recovery.state(),
        losses: recovery.losses(),
        restores: recovery.restores(),
      };
    },
    onRestored: () => {
      session.exitContextLoss();
      // Also redraws the menu scene when no game is running.
      renderActiveScene();
      probe.recovery = {
        state: recovery.state(),
        losses: recovery.losses(),
        restores: recovery.restores(),
      };
    },
    onTimeout: () => {
      // The former terminal sequence: stop every listener and the session, then
      // show the failure surface. The save bytes are never touched here.
      lifecycle.abort();
      focusController.abort();
      stopSession();
      showBootFailure(CONTEXT_RESTORE_FAILURE_COPY);
      publishFailure("The WebGL2 context was not restored.");
    },
  });

  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      // Without preventDefault the browser never offers a restore.
      event.preventDefault();
      recovery.lost();
    },
    { signal: lifecycle.signal },
  );
  canvas.addEventListener(
    "webglcontextrestored",
    () => {
      recovery.restored();
    },
    { signal: lifecycle.signal },
  );

  // T-3-22: release every listener, then the session (RAF, input, HUD, scene,
  // cache). `stopSession` is idempotent, so a second pagehide cannot double-free.
  window.addEventListener(
    "pagehide",
    () => {
      recovery.dispose();
      lifecycle.abort();
      focusController.abort();
      stopSession();
    },
    { signal: lifecycle.signal },
  );

  // The `#status` overlay is owned by the session (IN-02): it names the live
  // system once the session installs one, instead of a fixed boot string.
  const statsElement = document.getElementById("stats");
  if (statsElement !== null) {
    statsElement.hidden = true;
  }
}
