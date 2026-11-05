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

import { bootApp } from "./app/boot.js";
import { showBootFailure } from "./app/boot-failure.js";
import { showWebgl2Fallback } from "./app/fallback.js";
import { createGameSession } from "./app/game-session.js";
import { publishFailure, publishProbe, readMemory } from "./app/probe.js";
import type { WegoliteProbe } from "./app/probe.js";
import { createSceneManager } from "./app/scene-manager.js";
import manifest from "./content/generated/manifest.json";
import { loadEquipment } from "./content/equipment.js";
import { loadShipCatalogue } from "./content/ships.js";
import { LAZY_GALAXY_COUNT, galaxy0 } from "./content/systems.js";
import { createIndexedDbSaveStore } from "./persistence/idb-store.js";
import { parseSave } from "./persistence/save.js";
import type { SaveAllowLists, SaveV1 } from "./persistence/save.js";
import type { SaveStatus } from "./persistence/store.js";
import { createAssetCache } from "./render/asset-cache.js";
import { applyViewport } from "./render/viewport.js";
import { createDockedPanel } from "./ui/docked.js";
import { createTitleScreen } from "./ui/title.js";

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
  const docked = createDockedPanel(requireElement("docked"));
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
  let bootSave: SaveV1 | undefined;
  try {
    const [equipment, catalogue] = await Promise.all([
      loadEquipment(),
      loadShipCatalogue(),
    ]);
    const allowLists: SaveAllowLists = {
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
    // D-14: galaxy 0 is eager, so it is in this bundle; g1-g7 are code-split.
    homeSystems: galaxy0().length,
    codeSplitGalaxies: LAZY_GALAXY_COUNT,
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
      bounds: {},
    },
    launch: { count: 0, elapsed: 0, seen: false },
    memory: { geometries: 0, textures: 0, programs: 0 },
    bodies: [],
  };

  const session = createGameSession({
    renderer,
    assets,
    scenes,
    title,
    docked,
    hudCanvas,
    probe,
    system: lave,
    pauseRoot,
    controlsRoot,
    settingsRoot,
    gameRoot: canvas,
    save: {
      store: saveStore,
      status: saveStatus,
      ...(bootSave === undefined ? {} : { save: bootSave }),
    },
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

  const continueSave = bootSave;
  title.onStart(() => {
    void session.start();
  });
  if (continueSave !== undefined) {
    title.onContinue(() => {
      void session.start({ restore: continueSave, fresh: false });
    });
  }

  // D-15: focus loss auto-pauses and clears held input. `session.pause()` is a
  // no-op on the title/menu (there is no simulation yet) apart from clearing
  // input. Pointer-lock and fullscreen changes clear input even while paused.
  const focusController = new AbortController();
  const focusOptions: AddEventListenerOptions = {
    signal: focusController.signal,
  };

  window.addEventListener(
    "blur",
    () => {
      session.pause();
    },
    focusOptions,
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") session.pause();
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

  // T-3-19: a lost context stops the loop and says so in plain text. Full
  // restoration is Phase 7's QUAL-05; this phase does not claim it.
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    lifecycle.abort();
    focusController.abort();
    stopSession();
    const reason = "The WebGL2 context was lost.";
    showBootFailure(`${reason} Reload the page to restart Wegolite.`);
    publishFailure(reason);
  });

  // T-3-22: release every listener, then the session (RAF, input, HUD, scene,
  // cache). `stopSession` is idempotent, so a second pagehide cannot double-free.
  window.addEventListener(
    "pagehide",
    () => {
      lifecycle.abort();
      focusController.abort();
      stopSession();
    },
    { signal: lifecycle.signal },
  );

  const statusElement = document.getElementById("status");
  if (statusElement !== null) {
    statusElement.textContent = "Wegolite — new game: Lave";
  }
  const statsElement = document.getElementById("stats");
  if (statsElement !== null) {
    statsElement.hidden = true;
  }
}
