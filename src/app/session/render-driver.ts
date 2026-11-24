// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The render driver (Phase 8, D-12 step 3, ARCHITECTURE.md section 4.2).
 *
 * Everything that brings the scene graph, the HUD and the probe up to date for
 * one loop frame, and the redraw gate's decision about whether that frame has
 * to reach the GPU. The bodies are the ones `createGameSession` carried before
 * the split. The driver is read-only on simulation state: it never advances the
 * flight state, it only draws it.
 *
 * Per frame it also feeds the NPC ships (WORLD-15): the contact keys go to the
 * per-session model loader, the instanced NPC layer of the scene draws the
 * loaded models, and the loader is opened, once, right after the first
 * in-flight frame has been drawn, so no NPC model or texture is requested
 * before that frame (DATA-13, owner decision 2026-11-14, option A).
 *
 * Every live field is read through `ctx` inside the function that needs it and
 * is never copied to a factory-level variable (G-8): a Load replaces the flight
 * state, a jump or a quality change replaces the scene, and the nebula textures
 * arrive after the scene is built, so a held copy would make the redraw gate
 * compare against a dead object and skip a frame that has to be drawn.
 */

import type * as THREE from "three";
import type { System } from "../../content/types.js";
import type { FlightState } from "../../sim/flight/state.js";
import { countdownSecondsRemaining } from "../../sim/hyperspace/countdown.js";
import { hostilesNearPlayer } from "../../sim/combat/alert.js";
import { identTargetSnapshot } from "../../sim/combat/ident.js";
import {
  add,
  conjugate,
  dot,
  rotate,
  scale,
  sub,
  vec,
} from "../../sim/math.js";
import type { Quat, Vec3 } from "../../sim/math.js";
import { aegisStatus } from "../../sim/world/aegis.js";
import { debrisContacts, npcContacts } from "../../sim/world/contacts.js";
import type { DebrisContact } from "../../sim/world/contacts.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import {
  buoyPosition,
  isBuoyDestroyed,
  isBuoySubentityAttached,
} from "../../sim/world/statics.js";
import type { BuoyKey } from "../../sim/world/statics.js";
import type { World } from "../../sim/world/world.js";
import {
  computeSlotLaunchCamera,
  computeViewCamera,
  LAUNCH_PRE_ROLL_DURATION,
  launchViewElapsed,
  launchViewStationAngle,
  preRollPose,
  preRollViewTime,
} from "../../render/launch-camera.js";
import type { CameraPose } from "../../render/launch-camera.js";
import {
  BIG_BURST_DURATION,
  SMALL_BURST_DURATION,
} from "../../render/bodies/explosions.js";
import { MESSAGE_DURATION_SECONDS } from "../../render/hud/messages.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import {
  applyBuoyState,
  applyFrame,
  applyStationRoll,
  interpolatePose,
} from "../../render/sync.js";
import type { BuoyViewState, BuoyViewStates } from "../../render/sync.js";
import {
  HUD_DESIGN_HEIGHT,
  HUD_DESIGN_WIDTH,
  HUD_MESSAGE_ROWS,
} from "../../render/hud/draw.js";
import { projectIdentFrame } from "../../render/hud/projection.js";
import type { IdentFrame } from "../../render/hud/projection.js";
import { buildHudModel, preRollHudState } from "../hud-model.js";
import { hintGauges } from "../hints.js";
import type { HintContext } from "../hints.js";
import type { LaunchSequence } from "../launch-sequence.js";
import type { NpcModelLoader } from "../npc-models.js";
import type { WegoliteProbe } from "../probe.js";
import type { RedrawGate } from "../redraw-gate.js";
import type { SessionState } from "./context.js";

/**
 * D-01: the seconds the picture takes to fade to black and white after the
 * death. Oolite's `gameover-seconds-to-bw-fadeout` default of 5.0
 * (`gameOverFadeToBW`, `PlayerEntity.m:3566-3568` at the pin).
 */
export const GAME_OVER_FADE_SECONDS = 5;

/**
 * D-01: how far behind the dead ship the camera sits, along the ship's own
 * forward axis: `getDestroyedBy:` moves the player 100 m forward
 * (`moveForward:100.0`, `PlayerEntity.m:6187-6221` at the pin) and looks aft
 * (`VIEW_AFT`), so the view sees the ship it left behind. The coast
 * (`DEAD_COAST_SPEED_MPS`) starts from this setback.
 */
export const DEAD_CAMERA_SETBACK_M = 100;

/**
 * G-20-1 (owner decision 2026-11-24, D-01e): the speed at which the dead camera
 * coasts on, along the ship's forward axis. Oolite's `getDestroyedBy:` sets
 * `flightSpeed = 160.0f` (`PlayerEntity.m:6211` at the pin) with the velocity
 * and the turn rates zeroed (`:6212-6215`); the dead player is not docked, so
 * `performInFlightUpdates:` (`:2419-2425`) keeps moving it by
 * `moveForward:delta_t * flightSpeed` (`:3413-3414`) along its forward axis,
 * while `VIEW_AFT` looks back along the opposite one: the camera travels
 * straight away from the death point it looks at. Wegolite reproduces this
 * render-only on the presentation clock (`gameOverSeconds`), never in the sim.
 */
export const DEAD_COAST_SPEED_MPS = 160;

/**
 * Oolite's `NO_DRAW_DISTANCE_FACTOR` (`src/Core/Entities/Entity.h:45` at the
 * pin): Oolite draws no ship whose squared camera distance exceeds
 * `2 x (1024 x profile radius)^2` (`no_draw_distance`,
 * `src/Core/Entities/ShipEntity.m:815`; `isVisible`, `:1443-1446`; the draw
 * skipped past it, `:5558-5561`), the profile radius being the collision
 * radius for a ship without subentities (`:798`), as every debris piece is.
 * Wegolite uses it only for the dead view's redraw bound (D-01d): the debris
 * layer still draws every piece.
 */
export const NO_DRAW_DISTANCE_FACTOR = 1024;

/**
 * D-01d: whether one debris piece is in the dead camera's view, for the dead
 * view's redraw bound. `relative` is the piece's drawn position minus the
 * camera's world position, in float64. The piece's bounding sphere has to be
 * inside or cross each of the four side planes of the view frustum (the
 * camera looks along its local -Z; `fovYDegrees` is the vertical field of view
 * and `aspect` the width over the height), and the piece has to be within
 * Oolite's no-draw distance, `sqrt(2) x NO_DRAW_DISTANCE_FACTOR x radius`.
 * The near and far planes are not tested: the no-draw distance bounds the
 * depth. A radius that is not finite and positive, or a position that is not
 * finite, is never in view.
 */
export function isDebrisInDeadView(
  relative: Vec3,
  radius: number,
  cameraOrientation: Quat,
  fovYDegrees: number,
  aspect: number,
): boolean {
  if (!Number.isFinite(radius) || radius <= 0) return false;
  if (
    !Number.isFinite(relative.x) ||
    !Number.isFinite(relative.y) ||
    !Number.isFinite(relative.z)
  ) {
    return false;
  }
  const local = rotate(conjugate(cameraOrientation), relative);
  const reach = NO_DRAW_DISTANCE_FACTOR * radius;
  if (dot(local, local) > 2 * reach * reach) return false;
  const halfHeight = Math.tan((fovYDegrees * Math.PI) / 360);
  const halfWidth = aspect * halfHeight;
  const depth = -local.z;
  // The signed distance of the centre along each side plane's inward unit
  // normal, (+-x + halfWidth depth) / sqrt(1 + halfWidth^2) and the same for y.
  const wide = Math.sqrt(1 + halfWidth * halfWidth);
  const high = Math.sqrt(1 + halfHeight * halfHeight);
  return (
    (local.x + halfWidth * depth) / wide >= -radius &&
    (-local.x + halfWidth * depth) / wide >= -radius &&
    (local.y + halfHeight * depth) / high >= -radius &&
    (-local.y + halfHeight * depth) / high >= -radius
  );
}

/**
 * The presentation seconds after which the fade and the player's bursts have
 * finished (D-01a: the burst lifetimes come from the burst kinds, not from the
 * explosion settings, and do not depend on NPC traffic). Past it the dead view
 * draws nothing new unless a moving debris piece is in the camera's view.
 */
const DEAD_SETTLE_SECONDS = Math.max(
  GAME_OVER_FADE_SECONDS,
  SMALL_BURST_DURATION,
  BIG_BURST_DURATION,
);

/** What the driver calls outside the session context. */
export interface RenderDriverDeps {
  readonly renderer: THREE.WebGLRenderer;
  readonly hudCanvas: HTMLCanvasElement;
  readonly probe: WegoliteProbe;
  readonly redrawGate: RedrawGate;
  readonly messages: MessageQueue;
  readonly galaxyById: ReadonlyMap<string, System>;
  /** The probe publisher's per-frame publication. */
  readonly updateProbe: () => void;
  /** Redraw the station shell (a hint shown while docked). */
  readonly renderStation: () => void;
  /** The committed hyperspace target, resolved at call time. */
  readonly targetSystem: () => System | undefined;
  /**
   * The per-session NPC model loader. The driver feeds it the frame's contact
   * keys every frame and opens it, once, after drawing the first in-flight
   * frame (DATA-13); it is the only place that does.
   */
  readonly npcModels: NpcModelLoader;
  /**
   * The launch pre-roll timer (quick 261118-os8): while it runs the docked
   * session is drawn from inside the dock slot.
   */
  readonly launchSequence: Pick<
    LaunchSequence,
    "preRolling" | "preRollElapsed"
  >;
}

/**
 * The buoys as the live world has them this frame (plan 18-08, D-05, PD-01,
 * PD-02): where each is (`buoyPosition`), whether it is destroyed and whether
 * its subentity is attached. With no world both are alive, whole and at their
 * layout positions. Read by layout key; no entity id leaves the sim.
 */
export function buoyViewStates(
  world: World | undefined,
  layout: SystemLayout,
): BuoyViewStates {
  const one = (key: BuoyKey): BuoyViewState => ({
    position: buoyPosition(world, layout, key),
    destroyed: world !== undefined && isBuoyDestroyed(world, key),
    subentityAttached:
      world === undefined || isBuoySubentityAttached(world, key),
  });
  return { witchpoint: one("witchpoint"), navBuoy: one("navBuoy") };
}

/**
 * A debris contact drawn `seconds` after the death (D-01c): the position
 * advanced by the contact's velocity, every other field kept.
 */
function driftedContact(
  contact: DebrisContact,
  seconds: number,
): DebrisContact {
  return {
    ...contact,
    position: {
      x: contact.position.x + contact.velocity.x * seconds,
      y: contact.position.y + contact.velocity.y * seconds,
      z: contact.position.z + contact.velocity.z * seconds,
    },
  };
}

export function createRenderDriver(ctx: SessionState, deps: RenderDriverDeps) {
  const {
    renderer,
    hudCanvas,
    probe,
    redrawGate,
    messages,
    galaxyById,
    updateProbe,
    renderStation,
    targetSystem,
    npcModels,
    launchSequence,
  } = deps;

  /**
   * The last fade filter written to the canvas and the game-over overlay;
   * unknown until the driver's first frame, which therefore always writes it
   * (a canvas reused by a new session never keeps a stale filter).
   */
  let lastFilter: string | undefined;
  /** Whether the previous frame was drawn in the dead mode (the dust jump). */
  let deadFrameSeen = false;
  /**
   * D-01d: whether the last `renderFrame` found a moving debris piece in the
   * dead camera's view on the poses it drew. `renderFrame` runs every frame,
   * drawn or not, so `shouldDraw` reads a flag at most one frame old.
   */
  let movingDebrisInView = false;

  /**
   * What the drawn image depends on besides the simulation: the flight state
   * object (replaced by a Load), the scene (replaced by a jump, a quality
   * change or a test swap) and the nebula textures, which arrive after the
   * scene is built.
   */
  function drawKeys(): readonly unknown[] {
    // Read at this call, never kept: the keys compare the live objects by identity.
    const { state, scene } = ctx.core;
    return [state, scene, scene?.nebulae?.revision() ?? 0];
  }

  /**
   * Whether the loop's next frame has to reach the GPU (see `redraw-gate.ts`).
   * A docked or paused session simulates nothing, so its image cannot change;
   * a docked session in the launch pre-roll moves its camera every step and is
   * drawn (quick 261118-os8). The dead view is drawn every frame while the
   * fade and the explosion run, then idles like a paused one unless a moving
   * debris piece is in its camera's view (D-01, D-01d).
   */
  function shouldDraw(): boolean {
    const { paused } = ctx.runtime;
    const { state } = ctx.core;
    const frozenDocked = state?.mode === "docked" && !launchSequence.preRolling;
    const deadSettled =
      ctx.runtime.gameOver &&
      ctx.runtime.gameOverSeconds >= DEAD_SETTLE_SECONDS &&
      !movingDebrisInView;
    return redrawGate.next(paused || frozenDocked || deadSettled, drawKeys());
  }

  /**
   * Bring the scene graph, the HUD and the probe up to date, and draw them.
   *
   * @param draw False skips the WebGL draw and the HUD canvas draw; only the
   *   frame loop passes it, for a frame `shouldDraw` found unchanged. Every
   *   direct caller draws.
   */
  function renderFrame(alpha: number, draw = true): void {
    const currentState = ctx.core.state;
    const currentLayout = ctx.core.layout;
    const currentConfig = ctx.core.config;
    const currentScene = ctx.core.scene;
    const currentHud = ctx.runtime.hud;
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

    // The launch view and the cockpit supply a world pose; while docked the
    // first-person pose is derived from the interpolated ship pose.
    const pose = interpolatePose(
      ctx.core.previousPose,
      ctx.core.currentPose,
      alpha,
    );
    const launching = currentState.mode === "launching";
    // Quick 261118-os8: the presentation pre-roll before the sim launch; the
    // sim stays docked while it runs.
    const preRolling =
      currentState.mode === "docked" && launchSequence.preRolling;
    const launchView = preRolling || launching;
    // D-01: the dead view is Oolite's aft view set back 100 m. The first dead
    // frame forgets the previous camera, so the 100 m move gives the dust a
    // zero delta instead of a jump (the warm Load clears it the same way).
    const dead = currentState.mode === "dead";
    if (dead && !deadFrameSeen) ctx.core.previousCameraWorld = undefined;
    deadFrameSeen = dead;
    // D-10 (quick 261118-l26, 261118-os8): the view time of the drawn frame on
    // one timeline, the pre-roll then the launch time of the interpolated pose.
    // The station is rolled at that same time, so the slot walls hold still
    // against a camera that rolls with the hull.
    const viewTime = preRolling
      ? preRollViewTime(launchSequence.preRollElapsed, alpha)
      : launching
        ? LAUNCH_PRE_ROLL_DURATION +
          launchViewElapsed(currentState.launchElapsed, alpha)
        : 0;
    // The pre-roll pose, computed once: the camera is drawn from it and the
    // pre-roll HUD reads it (quick 261118-spu, PD-1).
    const preRollViewPose = preRolling
      ? preRollPose(currentLayout, ctx.core.dockGeometry, viewTime)
      : null;
    applyStationRoll(
      currentScene,
      launchView
        ? launchViewStationAngle(currentLayout, viewTime)
        : currentState.stationAngle,
    );
    let camera: CameraPose | null = null;
    if (launchView) {
      // The cockpit view from inside the dock slot (owner decisions
      // 2026-11-18, option 1 and the pre-roll). The slot depth is the
      // station's dock data, read live at this call (G-8); without it the
      // view is the cockpit. The pre-roll draws the launch pose at the mouth
      // rolled to the view time; the launch draws the interpolated sim pose.
      const viewPose = preRollViewPose ?? pose;
      camera = computeSlotLaunchCamera(
        currentLayout,
        ctx.core.dockGeometry?.port.depth,
        currentConfig.launchSpeed,
        viewPose.position,
        viewPose.orientation,
        viewTime,
      );
    } else if (currentState.mode === "inFlight") {
      // CBT-04: the camera follows the sim's current view (also the weapon
      // facing); a missing combat state is the fore view.
      camera = computeViewCamera(
        pose.position,
        pose.orientation,
        ctx.core.combat?.view ?? "fore",
        ctx.core.dockFeedback.shakeOffset(currentState.flightTime),
      );
    } else if (dead) {
      // `getDestroyedBy:` moves the ship 100 m along its local -Z and looks aft,
      // and the ship then coasts on at 160 m/s (G-20-1, D-01e): the camera is
      // the frozen pose plus forward x (setback + speed x presentation time),
      // a local computed in float64 and never written to the sim. The player's
      // own hull stays hidden below.
      const coastDistance =
        DEAD_CAMERA_SETBACK_M +
        DEAD_COAST_SPEED_MPS * ctx.runtime.gameOverSeconds;
      camera = computeViewCamera(
        add(
          pose.position,
          scale(rotate(pose.orientation, vec(0, 0, -1)), coastDistance),
        ),
        pose.orientation,
        "aft",
        vec(0, 0, 0),
      );
    }
    const cameraWorld = applyFrame(
      currentScene,
      ctx.core.previousPose,
      ctx.core.currentPose,
      alpha,
      currentLayout,
      camera,
      currentState.flightTime,
    );
    // Plan 18-08: the buoys as the live world has them, read at this frame and
    // not kept (G-8). The one value feeds the scene and the scanner, so a
    // destroyed buoy leaves both on the same frame and a moved one is drawn,
    // plotted and pointed at in one place.
    const buoys = buoyViewStates(ctx.core.worldLifecycle?.world, currentLayout);
    applyBuoyState(currentScene, buoys, cameraWorld);
    // D-04: dust is camera-local. The world delta comes from the one transform
    // path; the field wraps inside its box, so it never drifts to the origin.
    const currentDust = currentScene.dust;
    const cameraDelta =
      ctx.core.previousCameraWorld === undefined
        ? vec(0, 0, 0)
        : sub(cameraWorld, ctx.core.previousCameraWorld);
    // While dead the flight state's speed is the frozen death-tick speed, so it
    // is never passed: the dust gets the coast speed on a frame where the
    // camera moved (3.2 m streaks along the motion) and 0 on a frame where it
    // did not (the first dead frame, a repeated presentation time, a context
    // restore), which draws the 0.5 m minimum streaks, never the frozen speed's
    // random-axis streaks of up to 40 m (20-UAT.md G-20-1, root cause 1a). The
    // streak form is Wegolite's flight rendering, not Oolite's `GL_POINTS`
    // (FIDELITY E-179). The torus factor is 1: after a death at hyperspeed
    // Oolite keeps its stale hyperspeed flag (`PlayerEntity.m:2740` is not rerun
    // while dead) and draws warp lines (`DustEntity.m:248`, `:273`); Wegolite
    // draws ordinary dust, a Wegolite choice.
    const cameraMoved =
      cameraDelta.x !== 0 || cameraDelta.y !== 0 || cameraDelta.z !== 0;
    currentDust.update(
      cameraDelta,
      dead ? (cameraMoved ? DEAD_COAST_SPEED_MPS : 0) : currentState.speed,
      dead ? 1 : currentState.torus.factor,
    );
    ctx.core.previousCameraWorld = cameraWorld;
    // The cockpit view never shows the player's own hull, the launch included.
    currentScene.ship.visible = false;

    // WORLD-15: id-free ship contacts from the live world, read at this frame
    // and not kept (G-8); no world (docked, traffic off) is empty. The one
    // array feeds the model requests, the instanced NPC layer and the scanner.
    const contacts = npcContacts(ctx.core.worldLifecycle?.world);
    // A no-op until the loader is open; the layer draws only loaded keys, so a
    // ship whose model has not arrived still shows on the scanner.
    npcModels.request(contacts.map((contact) => contact.specKey));
    currentScene.npcs.update(contacts, cameraWorld, npcModels.loaded());
    // WORLD-17: the pods, plates and wrecks, as id-free debris contacts read
    // at this frame and not kept. Their models ride the same per-session
    // loader and its first-in-flight-frame latch (DATA-13), so a cold start
    // requests no debris GLB; a key whose model has not arrived is not drawn.
    // Debris is not on the scanner (D16-26).
    const debris = debrisContacts(ctx.core.worldLifecycle?.world);
    npcModels.request(debris.map((contact) => contact.specKey));
    // D-01: while dead the sim clock is frozen, so the explosions, the shots
    // and the debris run on the effect clock, the flight time plus the seconds
    // since the death; alive, `gameOverSeconds` is 0 and it is the flight time.
    const effectTime = currentState.flightTime + ctx.runtime.gameOverSeconds;
    // D-01c, D-01d: debris already in flight keeps moving on screen only, with
    // no time limit: each piece is drawn at its last sim position plus its
    // velocity times the seconds since the death (a render-side extrapolation;
    // the sim is frozen and nothing is written back). The pose is computed
    // before the layer's camera subtraction, in float64.
    const drawnDebris = ctx.runtime.gameOver
      ? debris.map((contact) =>
          driftedContact(contact, ctx.runtime.gameOverSeconds),
        )
      : debris;
    currentScene.debris.update(
      drawnDebris,
      cameraWorld,
      npcModels.loaded(),
      ctx.core.npcTraffic?.debrisModels ?? [],
      effectTime,
    );
    // D-01d: the redraw bound. Past the settle time the dead view is drawn only
    // while a moving piece is in the dead camera's view, as these drawn poses
    // put it; a piece at rest never holds the redraw.
    movingDebrisInView =
      dead &&
      camera !== null &&
      drawnDebris.some(
        (contact) =>
          (contact.velocity.x !== 0 ||
            contact.velocity.y !== 0 ||
            contact.velocity.z !== 0) &&
          isDebrisInDeadView(
            sub(contact.position, cameraWorld),
            contact.radius,
            camera.quaternion,
            currentScene.camera.fov,
            currentScene.camera.aspect,
          ),
      );
    // CBT-05: the shots added by `laserFired` this frame or earlier, drawn
    // camera-relative and retired after their 0.09 s of flight time.
    currentScene.shots.update(cameraWorld, effectTime, {
      position: currentState.position,
      orientation: currentState.orientation,
    });
    // WORLD-17: the explosions added by `shipDestroyed`, drawn camera-relative
    // facing the camera and retired by flight time. Presentation only: the
    // layer reads no sim stream and writes nothing back.
    currentScene.explosions.update(
      cameraWorld,
      currentScene.camera.quaternion,
      effectTime,
    );

    // D-01: the fade to black and white covers the scene and, through the
    // overlay, the four lines (Oolite saturates the whole frame). Written only
    // when it changes; a CSS filter costs no draw call.
    const filter = dead
      ? `saturate(${String(
          1 - Math.min(1, ctx.runtime.gameOverSeconds / GAME_OVER_FADE_SECONDS),
        )})`
      : "";
    if (filter !== lastFilter) {
      lastFilter = filter;
      renderer.domElement.style.filter = filter;
      ctx.runtime.gameOverOverlay?.setFilter(filter);
    }

    if (draw) {
      renderer.render(currentScene.scene, currentScene.camera);
      redrawGate.drawn(drawKeys());
      // The first in-flight frame has now been drawn and this call's
      // `updateProbe` publishes it; model requests start from the next frame
      // (DATA-13, owner decision 2026-11-14, option A; Key Decisions row
      // "Defer NPC model requests until the first in-flight frame").
      if (currentState.mode === "inFlight") npcModels.open();
    }

    // The message rows' clock: the flight time plus the docked wall time
    // (quick task 261117-u3m). Oolite draws the message area on every screen,
    // docked ones included, and counts each row down with the frame delta
    // (Universe.m:4735-4736, 4810-4827; GuiDisplayGen.m:1308-1312,
    // 1327-1336), so the rows are advanced on every frame, docked or not
    // drawn, before the HUD is considered. Oolite does not clear the area at
    // docking (only a docking report or a mission screen does,
    // PlayerEntity.m:11318-11337), so neither does Wegolite.
    const messageClock =
      currentState.flightTime + ctx.runtime.dockedMessageSeconds;
    messages.advance(messageClock);
    // D-09 (quick task 261118-cyn): Oolite writes the countdown into the
    // message queue from the player's update, not the draw, on every frame of
    // the countdown with a 1 s row time (`PlayerEntity.m:3443-3450`); the
    // queue writes only a changed count once its 1 s repeat time has passed
    // (`Universe.m:6258-6267`). The text is descriptions.plist
    // `witch-to-x-in-y-seconds`, the seconds Oolite's `round`.
    const countdownTarget = currentState.hyperspaceTarget;
    if (currentState.hyperspaceCountdown > 0 && countdownTarget !== null) {
      const destination =
        galaxyById.get(countdownTarget.id)?.name ?? "(Unknown)";
      const seconds = countdownSecondsRemaining(
        currentState.hyperspaceCountdown,
      );
      messages.displayCountdown(
        `Witchspace to ${destination} in ${String(seconds)} s.`,
        1,
      );
    }

    // The flight HUD is drawn while launching and in the launch pre-roll, as
    // Oolite draws it while launching (`Universe.m:4718-4732` at 7437f22 skips
    // it only when dead, in the escape sequence or at game start; quick
    // 261118-spu). `buildHudModel` hides the compass blip and holds the roll
    // bar at 0 while launching. A docked session without a pre-roll shows the
    // status panel (D-09), not the HUD. The pre-roll HUD reads the launch start
    // state (`preRollHudState`, PD-1); the live state is never written.
    const hudHidden = (currentState.mode === "docked" && !preRolling) || dead;
    hudCanvas.hidden = hudHidden;
    const hudState =
      preRollViewPose === null
        ? currentState
        : preRollHudState(
            currentState,
            currentLayout,
            currentConfig,
            ctx.core.dockGeometry,
            preRollViewPose,
          );
    // The page overlay's version and system lines are hidden by CSS while the
    // HUD canvas shows (D-02); the mark keeps them hidden for the whole launch
    // view, the pre-roll included (quick 261118-os8).
    hudCanvas.toggleAttribute("data-launching", launchView);
    // The same for the dead view (D-01): the HUD canvas is hidden and the
    // 20-05 CSS rule keeps the page's version and system lines hidden too.
    hudCanvas.toggleAttribute("data-dead", dead);
    if (!hudHidden && draw) {
      // Oolite's message rows (quick task 261117-pij): the bottom
      // HUD_MESSAGE_ROWS of the ten, newest at the bottom.
      const rows = messages.rows(messageClock, HUD_MESSAGE_ROWS);
      const message = messages.current(messageClock);
      const model = buildHudModel(
        hudState,
        currentLayout,
        currentConfig,
        message,
        ctx.core.profile.fuel,
        ctx.core.dockFeedback.flashAlpha(currentState.flightTime),
        targetSystem()?.name ?? "",
        contacts,
        {
          combat: ctx.core.combat,
          identFrame: identFrameFor(currentScene.camera, camera),
          viewAspect: currentScene.camera.aspect,
          messageRows: rows,
          buoys,
          // Oolite's hostiles flag (`PlayerEntity.m:2935-2950`), read from
          // the live world at this frame and not kept (G-8).
          hostiles: hostilesNearPlayer(
            ctx.core.worldLifecycle?.world,
            hudState.position,
          ),
        },
      );
      currentHud.draw(model);
      ctx.core.lastModel = model;
    }
    // Hints read the live sim state on purpose, never the pre-roll copy
    // (quick 261118-spu, PD-3).
    showHint(currentState);
    updateProbe();
  }

  /**
   * D-03: the frame around the ident-locked target, projected through the
   * pose the scene is drawn from this frame (the current view, shake
   * included), or null with no lock, no world, no layout, no in-flight pose or
   * the target out of view. A static target (the station, a buoy) is framed at
   * its live position and layout radius (plan 18-06). The lock's entity id
   * never leaves the sim (`identTargetSnapshot`).
   */
  function identFrameFor(
    live: THREE.PerspectiveCamera,
    pose: CameraPose | null,
  ): IdentFrame | null {
    const combat = ctx.core.combat;
    if (combat === undefined || pose === null) return null;
    const target = identTargetSnapshot(
      combat,
      ctx.core.worldLifecycle?.world,
      ctx.core.layout,
    );
    if (target === undefined) return null;
    return projectIdentFrame(
      pose,
      live.fov,
      live.aspect,
      target,
      HUD_DESIGN_WIDTH,
      HUD_DESIGN_HEIGHT,
    );
  }

  /**
   * D-11: one first-use hint at a time, never a modal or overlay. A hint is a
   * Wegolite message, posted for `MESSAGE_DURATION_SECONDS` on its own row, so
   * it never delays a reply posted after it.
   */
  function showHint(currentState: FlightState): void {
    const currentHints = ctx.runtime.hints;
    if (currentHints === undefined) return;
    const currentLayout = ctx.core.layout;
    const context: HintContext = {
      mode: currentState.mode,
      massLocked: currentState.torus.massLocked,
      torusEngaged: currentState.torus.engaged,
      speedInput: ctx.core.currentFrame.speed,
      pitchRollInput:
        ctx.core.currentFrame.pitch !== 0 || ctx.core.currentFrame.roll !== 0,
      flightTime: currentState.flightTime,
      // D-07: the same rule that draws the aegis "S" (quick task 261118-cyn).
      inDockingRange:
        currentLayout !== undefined &&
        aegisStatus(currentState.position, currentLayout) === "dockingRange",
      // The bars `buildHudModel` stored for this frame (quick task 261118-ioj).
      gauges: hintGauges(ctx.core.lastModel?.bars),
    };
    const hint = currentHints.maybeShow(context);
    if (hint === null) return;
    probe.hint = hint;
    if (currentState.mode === "docked") {
      ctx.station.stationMessage = hint;
      renderStation();
    } else messages.enqueue(hint, MESSAGE_DURATION_SECONDS);
  }

  return { renderFrame, shouldDraw, drawKeys, showHint };
}

/** The driver's shape, derived so no interface spells renderFrame's parameters. */
export type RenderDriver = ReturnType<typeof createRenderDriver>;
