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
import { LAZY_GALAXY_COUNT, galaxy0 } from "./content/systems.js";
import { createAssetCache } from "./render/asset-cache.js";
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
    const camera = scenes.active().camera;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    session.resize();
    renderActiveScene();
  }

  window.addEventListener("resize", resize, { signal: lifecycle.signal });
  resize();

  // Published after the first render so `ready` implies the probe's numbers are
  // real.
  publishProbe(probe);

  title.onStart(() => {
    void session.start();
  });

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
