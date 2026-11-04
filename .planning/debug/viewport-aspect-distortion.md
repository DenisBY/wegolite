---
status: diagnosed
trigger: "viewport-aspect-distortion — 3D scene non-uniformly scaled: planet limb reads as ellipse, Coriolis squashed, starfield rotates along ellipse; 2D HUD stays circular. Viewport 2222x1000 (~2.22:1)."
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:55:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — every `PerspectiveCamera` in the render layer is constructed with `aspect = 1`. Only `main.ts`'s `resize()` ever writes `camera.aspect`, and it writes it to `scenes.active().camera` at boot (the empty scene) and on `window.resize`. Entering the real menu (`enterMenu`, after preload) and the system (`enterSystem`, on Start) installs brand-new cameras whose aspect stays 1. No resize event accompanies those scene swaps, so the flight camera projects with aspect 1 into a 2222x1000 (~2.22:1) canvas; the image is stretched horizontally by 2.22, turning spheres into ellipses. The HUD is circular because `hud.resize()` is called on Start (`game-session.ts:629`) and scales uniformly.
test: Static: `rg '\.aspect|updateProjectionMatrix'` returns exactly `src/main.ts:178-179`; `rg 'new THREE.PerspectiveCamera'` returns only the three `aspect = 1` constructions. Dynamic falsifier: start a game at 2222x1000 (no window resize) → camera.aspect is 1; trigger one window resize → `main.ts:177-179` sets it to 2.222 and geometry snaps round.
expecting: camera.aspect === 1 (not 2.222) immediately after Start; one resize event after Start restores correct geometry.
next_action: Return ROOT CAUSE FOUND (diagnosis-only). Do not modify code.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: >
  Geometry keeps a correct aspect ratio across the system extent — the planet limb and
  station read as circles/spheres, and rotation moves the starfield along circular paths.
actual: >
  User reported (Russian): "дрожания не наблюдается, но планета вместо круга выглядит как
  элипс, станция тоже сплюснута и при врашении звезды перемещаются по элипсу вместо круга" —
  "No jitter observed, but the planet looks like an ellipse instead of a circle, the station
  is also squashed, and when rotating the stars move along an ellipse instead of a circle."
  The 2D HUD stays circular, so the mismatch is between the WebGL camera/scene projection
  and the actual canvas pixel size. Viewport 2222x1000 (aspect ~2.22:1).
errors: None reported
reproduction: >
  Launch from the Coriolis in a browser window at ~2222x1000, fly toward Lave / rotate the
  ship; compare the 3D geometry against the circular 2D HUD elements.
started: Discovered during UAT (Phase 03, test 2)
evidence:
  - /tmp/orca-paste-1793780723287-fba9c8fa-d8a0-4b29-bf35-30094231b4a0.png
  - /tmp/orca-paste-1793780745422-051ac1bd-e437-4662-a28d-c251a0034162.png

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "The CSS canvas size and the WebGL backing store disagree (letterbox/aspect-ratio CSS, `setSize(..., false)` leaving a stale CSS size), so the browser scales the rendered buffer non-uniformly."
  evidence: >
    `index.html` styles `#view { display:block; width:100vw; height:100vh }` inside
    `html, body { height:100%; overflow:hidden }` (no scrollbar, no letterbox transform).
    `main.ts:176` calls `renderer.setSize(width, height, false)` with the same
    `window.innerWidth/innerHeight` that the HUD uses (`hud.ts:88-98`) and that
    `tests/e2e/resize.spec.ts:59-75` asserts equals the resized buffer dimensions.
    The same source of truth produces a correct, circular HUD, so the CSS/backing-store
    pair agrees; only the camera projection is wrong. (2026-11-04T00:35Z)
  timestamp: 2026-11-04T00:35:00Z

- hypothesis: "A shader or post-process hard-codes/modifies the projection or the horizontal scale, independently of the camera."
  evidence: >
    `rg -n '\.aspect|updateProjectionMatrix' src tests` returns exactly
    `src/main.ts:174,178,179` and nothing else. The planet shader only uses the
    supplied `projectionMatrix * viewMatrix * world`
    (`src/render/shaders/planet.glsl.ts:43`); there is no post-processing pass. (2026-11-04T00:40Z)
  timestamp: 2026-11-04T00:40:00Z

- hypothesis: "An ultrawide/letterbox path resizes/reflows one surface (HUD or 3D) but not the other."
  evidence: >
    The only letterboxing is Canvas2D HUD design-space scaling (`hud.ts:100-106`,
    uniform `scale = min(backingW/1920, backingH/1080)` + centred offsets); there is no
    3D letterbox code anywhere. The defect is not ultrawide-specific: the system camera
    is aspect 1 at every window shape, so a 16:9 canvas is stretched by 1.78x and a
    2.22:1 canvas by 2.22x — wider viewports merely make it 25% worse, which is why UAT
    (run at 2222x1000) noticed it. (2026-11-04T00:45Z)
  timestamp: 2026-11-04T00:45:00Z

- hypothesis: "`devicePixelRatio` is applied to the backing-store size but not to the aspect calculation."
  evidence: >
    `renderer.setPixelRatio(min(dpr,2))` (`boot.ts:82`) affects only `canvas.width/height`;
    `camera.aspect` uses CSS `innerWidth/innerHeight` (`main.ts:171-178`), and the canvas
    CSS box is `100vw x 100vh`, so the CSS aspect and the buffer aspect are identical
    after the DPR factor cancels. The screenshots are 4092x1904 and 2050x948, i.e. the
    distortion is present at both DPR 2 and ~1; it is not a DPR bug. (2026-11-04T00:45Z)
  timestamp: 2026-11-04T00:45:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-04T00:10:00Z
  checked: codebase-memory index_status (project `wegolite`) and search_graph for `resize`, `aspect`, and CSS/canvas sizing.
  found: >
    Index ready (4,493 nodes, 13,274 edges, indexed 2026-11-03T20:34:58Z). Three `resize`
    functions: `src/main.ts:170-182`, `src/app/game-session.ts:714-716`,
    `src/render/hud/hud.ts:87-108`. No `ResizeObserver` anywhere.
  implication: Only these three paths can react to viewport changes; the 3D and 2D paths must be compared here.

- timestamp: 2026-11-04T00:15:00Z
  checked: `src/main.ts:170-185` (boot/resize path).
  found: >
    `resize()` computes `width = window.innerWidth`, `height = window.innerHeight`,
    calls `renderer.setSize(width, height, false)`, then
    `const camera = scenes.active().camera; camera.aspect = width / height;
    camera.updateProjectionMatrix();` and finally `session.resize()` + a render.
    It is registered on `window.resize` and called once at boot (`main.ts:184-185`).
  implication: >
    This is the *only* code that ever sets a camera aspect. It targets whichever camera is
    active at that instant; any camera installed later begins life with the constructor's
    default aspect.

- timestamp: 2026-11-04T00:20:00Z
  checked: Camera construction sites — `src/app/scene-manager.ts:52-59`, `src/render/system-scene.ts:224-233`, `src/render/menu-scene.ts:41-46`.
  found: >
    All three construct `new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, CAMERA_NEAR,
    CAMERA_FAR)` — the second argument (aspect) is literally `1` in each. No constructor
    takes a width/height. `createSystemScene` calls its `createCamera()` at
    `system-scene.ts:312`, and `createSceneManager` calls its own at
    `scene-manager.ts:52-70` for the empty pre-load scene.
  implication: >
    A newly created camera always starts with a square (1:1) projection, independent of
    the actual window. Three computes the projection matrix in the constructor, so this
    is live immediately.

- timestamp: 2026-11-04T00:25:00Z
  checked: Scene-install paths — `src/app/scene-manager.ts:92-113`; `src/app/game-session.ts:584-631`.
  found: >
    `enterMenu()` installs `createMenuScene(assets)` (a new camera, aspect 1) and
    `enterSystem()` installs `createSystemScene(...)` (a new camera, aspect 1); neither
    touches `camera.aspect` or calls `renderer.setSize`. On Start,
    `game-session.ts:615` calls `scenes.enterSystem(...)`, then `:628-629` creates and
    resizes the HUD only: `hud = createHud(hudCanvas); hud.resize();`. The first system
    frame is rendered at `:710` with the aspect-1 camera.
  implication: >
    The system camera is installed after the last `main.ts` resize and is never repaired.
    The HUD is resized at exactly that moment, which is why the 2D overlay is correct
    while the 3D projection is stretched. This is the root cause, not a CSS/DPR issue.

- timestamp: 2026-11-04T00:30:00Z
  checked: Frame render call — `src/app/game-session.ts:420-466`.
  found: >
    `renderer.render(currentScene.scene, currentScene.camera)` uses the installed
    system scene's camera every frame. The flight loop never touches `camera.aspect` or
    `updateProjectionMatrix`.
  implication: Every flight frame is projected with aspect 1 until an unrelated window
    resize happens to run `main.ts:177-179` against the same camera.

- timestamp: 2026-11-04T00:32:00Z
  checked: Boot ordering — `src/main.ts:68-88,184-185`.
  found: >
    `scenes.enterMenu()` at `:70` installs the *empty* scene (assets not loaded yet);
    `resize()` at `:185` therefore sets the empty camera's aspect correctly. The
    `assets.preload().then(...)` callback at `:82-88` later installs the real menu scene
    with a fresh aspect-1 camera. The opaque `#title-screen` DOM overlay hides that
    distortion; the system scene installed on Start inherits the same default.
  implication: >
    The one correct-aspect camera is the throwaway empty scene; every camera the player
    actually sees (menu behind the overlay, then flight) is aspect 1. This also explains
    why the defect appears only from Start onward.

- timestamp: 2026-11-04T00:38:00Z
  checked: Screenshot 2 (`/tmp/orca-paste-1793780745422-...png`, 2050x948, aspect 2.16) — station silhouette and HUD compass.
  found: >
    The Coriolis is visibly wider than tall (its 3D silhouette spans ~512 px wide by
    ~216 px tall, ~2.4:1; the main connected hull component alone fits an ellipse of
    ~1.87:1), while the HUD compass ring in the same frame is a true circle (~62 px
    diameter). Screenshot 1 (4092x1904, aspect 2.15) shows the same: the planet limb
    arcs and the station are horizontally stretched while every 2D HUD ring is circular.
  implication: >
    Independent visual confirmation that the whole 3D layer is scaled by roughly the
    canvas aspect while the 2D layer is not. The exact station ratio is view-dependent
    (a Coriolis octahedron is not a sphere), so it is supporting evidence, not the proof;
    the proof is the aspect-1 camera.

- timestamp: 2026-11-04T00:42:00Z
  checked: Test coverage — why the gate is green.
  found: >
    No test anywhere references `camera.aspect` or any camera projection
    (`rg 'aspect' tests` → no hits). `tests/e2e/resize.spec.ts` never presses Start; it
    only resizes after boot, so it exercises the empty scene and asserts buffer size and
    `renders`. `tests/e2e/hud.spec.ts:155` presses Start and *then* calls
    `page.setViewportSize({width:2560,height:1080})` — that resize event incidentally
    repairs the system camera — but it asserts only HUD letterbox/scale values.
    `precision.spec.ts` asserts draw calls/triangles, not geometry shape.
  implication: >
    The committed suite cannot observe the defect: it either never enters the system or
    resizes after entering it, which silently fixes the camera, and it never checks
    projection geometry.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: >
  Every `PerspectiveCamera` is constructed with `aspect = 1`
  (`src/app/scene-manager.ts:52-59`, `src/render/system-scene.ts:224-233`,
  `src/render/menu-scene.ts:41-46`). The only code that ever writes a real aspect is
  `src/main.ts:170-182`, which acts on `scenes.active().camera` when a `window.resize`
  fires (and once at boot, before the real scenes exist). Starting a game calls
  `scenes.enterSystem()` (`src/app/game-session.ts:615`), which installs a brand-new
  system scene with a fresh aspect-1 camera; no resize follows, and the flight loop
  renders with it unchanged (`game-session.ts:466`). `hud.resize()` at
  `game-session.ts:629` sizes only the Canvas2D overlay, which scales uniformly. Result:
  a 2222x1000 (~2.22:1) canvas receives a 1:1 projection, so the entire 3D layer is
  stretched horizontally by `innerWidth/innerHeight` (2.22) — spheres become ellipses,
  the Coriolis is squashed vertically, and rotational paths become ellipses — while the
  HUD stays circular. The defect exists at every non-square aspect (1.78x at 16:9) and is
  merely 25% worse at 2.22:1 than at 16:9; it is not ultrawide-specific. Any window
  resize after Start happens to repair it because `main.ts:177-179` then targets the
  live system camera; reloading and starting again reintroduces it. The same bug affects
  the real menu scene (hidden by the opaque title overlay) and the test-only
  `performSwap()` path (`game-session.ts:725-728`).
fix: >
  Not applied (goal: find_root_cause_only). Fix direction: set the aspect from the
  renderer's current size whenever a camera is installed, not only on window resize —
  e.g. have `createSceneManager` capture `renderer.getSize()` and apply
  `camera.aspect = size.x / size.y; camera.updateProjectionMatrix()` in `enterMenu()` and
  `enterSystem()` (covering `performSwap()` too), or return to a single
  `applyViewport()` called by main.ts after every scene swap. Do not rely on
  constructor-time window access in the pure render modules.
verification: >
  Not applied. Static proof: `rg '\.aspect|updateProjectionMatrix'` → only
  `src/main.ts:178-179`; all three camera constructors pass `1`; `enterSystem`/
  `enterMenu` install new cameras with no resize; `hud.resize()` is Start's only resize.
  Supporting visual proof: HUD compass is circular while the same frame's 3D geometry is
  stretched ~2.2x horizontally. Falsifier: after Start at 2222x1000 without a resize,
  `scenes.active().camera.aspect` is 1; a single `window.resize` makes it 2.222 and the
  geometry round.
files_changed: []
