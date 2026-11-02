---
status: diagnosed
trigger: "Resizing the browser window re-renders the scene, so the starfield stays visible at the new size and after restoring the original size."
created: 2026-11-02T00:00:00Z
updated: 2026-11-02T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — resize() resizes the WebGL drawing buffer and camera aspect but never calls renderer.render(); the only render is the one-shot boot render, so every resize presents a cleared buffer and no path repaints it.
test: read src/main.ts:121-132 and grep the tree for setAnimationLoop/requestAnimationFrame/renderer.render
expecting: render only at src/main.ts:132; no loop anywhere
next_action: diagnosis complete (goal: find_root_cause_only); no code changes made

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: |
  With the dev server (`docker compose up app`, http://localhost:5173) loaded at one window
  size, resizing the browser window (e.g. 1280x720 -> 900x600) re-renders the scene at the new
  size. The starfield, near box and overlays stay visible, and they are still visible after
  restoring the window to its original size. No blank or stale canvas.
actual: |
  "when I resize browser window, all \"start\" disapper and don't appear also if restore to
  original size" (user UAT report; "start" = stars)
errors: None reported
reproduction: Test 4 in UAT (Phase 01 walking skeleton)
started: Discovered during UAT on 2026-11-02

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: A CSS/layout bug hides or zero-sizes the canvas on resize (e.g. width/height, overflow, overlay covering it).
  evidence: index.html styles `#view { display: block; width: 100vw; height: 100vh }` with `html, body { height: 100%; overflow: hidden; background: #000 }`; resize measures `window.innerWidth/innerHeight`. The canvas element stays full-window, and the user reports the HTML overlays stay visible — only the WebGL-rendered stars vanish. Rendering content, not layout, disappears.
  timestamp: 2026-11-02

- hypothesis: A context loss (`webglcontextlost`) is being triggered, permanently breaking the context on resize.
  evidence: No `webglcontextlost`/`webglcontextrestored` listener exists, but the documented in-container probe recorded `canvas` 1280x720 -> 900x600 with 0 draws / 0 clears afterwards, i.e. the context still works and simply is not drawn to; a lost context would not produce the successful setSize/camera update observed. The symptom is deterministic on every resize, not an occasional context-loss event.
  timestamp: 2026-11-02

- hypothesis: A render loop was intended in Phase 1 and was accidentally omitted.
  evidence: `01-01-PLAN.md:157` explicitly instructs "Do not add a `requestAnimationFrame` loop in this task"; `01-03-PLAN.md:196` records "plan 01-01 deliberately omits a render loop; revisit in Phase 3"; `.planning/research/ARCHITECTURE.md:51` puts the `app/GameLoop` (`requestAnimationFrame` accumulator) in the later architecture. Deferring the loop is intentional; the defect is the missing repaint in the resize handler, not the absence of a loop.
  timestamp: 2026-11-02

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-02
  checked: codebase-memory index_status (project `wegolite`) and search_graph for "resize"
  found: index ready (860 nodes, 1637 edges, indexed 2026-11-02T18:39:23Z); one `resize` function at `src/main.ts:121-127`.
  implication: the graph agrees with the source; no other resize handler exists.

- timestamp: 2026-11-02
  checked: src/main.ts:102-161 (full boot path)
  found: Boot creates renderer/camera/scene, calls `resize()` once at line 130 then `renderer.render(scene, camera)` once at line 132, then publishes `window.__wegolite`. `resize()` (lines 121-127) only does `renderer.setSize(width, height, false)`, `camera.aspect = width / height`, `camera.updateProjectionMatrix()`. No render call inside `resize()`, and `renderer.render` appears exactly once in the file.
  implication: every `resize` event after boot resizes the drawing buffer without repainting. This is CR-01 confirmed against the source.

- timestamp: 2026-11-02
  checked: grep across src/tests/index.html for `setAnimationLoop|requestAnimationFrame|renderer.render|setSize|resize`
  found: only four hits, all in `src/main.ts` (resize fn 121, setSize 124, listener 129, render 132). No animation loop, no second render call, no `preserveDrawingBuffer` option anywhere.
  implication: nothing ever repaints the scene after a resize. Default `preserveDrawingBuffer: false` means buffer contents are undefined after presentation, and `setSize` reallocates the drawing buffer to the new pixel dimensions — the compositor therefore presents a cleared (black, over `background:#000`) canvas.

- timestamp: 2026-11-02
  checked: .planning/phases/01-foundation-containers-compliance/01-REVIEW.md:25-58 (CR-01) and 01-VERIFICATION.md:74-75, 208, 228, 235
  found: Independent in-container Playwright probe against `vite preview`: after 1280x720 -> 900x600 `canvas.width/height` became 900/600 while patched `drawElements`/`drawArrays`/`clear` counters all stayed at 0. REVIEW/VERIFICATION conclusion: `setSize` resets the WebGL drawing buffer, no repaint follows, so the page presents a cleared/black canvas; the e2e spec never resizes, so the suite cannot catch it. CR-01 disposition in `01-REVIEW-DISPOSITION.md` is `open`.
  implication: runtime measurement matches the static reading. The failure is "zero draws after resize", not a rendering-content or layout bug.

- timestamp: 2026-11-02
  checked: tests/e2e/precision.spec.ts (the only browser test)
  found: It loads the page once at the fixed Playwright viewport 1280x720, waits for `window.__wegolite?.ready === true`, asserts boot probe values (`calls > 0`, `triangles > 0`, `logDepth`, `depthBits`, `nearRelZ`, `farRelZ`, `farUlp`) and the footer text, and asserts no console errors. It never calls `page.setViewportSize` and never checks `renderer.info.render.calls` after boot.
  implication: no test asserts the one-shot render behavior as desired, but no test exercises resize either. The defect ships undetected by the committed gate (which is green).

- timestamp: 2026-11-02
  checked: why restoring the original window size does not recover the image
  found: `resize()` runs on every resize event, including the one back to the original size. Each run calls `renderer.setSize(...)`, which sets `canvas.width/height` (pixel-ratio scaled) and reallocates the drawing buffer; with `preserveDrawingBuffer: false` the new buffer starts cleared. Because no render follows either event, the buffer stays empty. The scene graph and camera are unchanged and still valid — only the presented pixels are gone.
  implication: the restore path is the same bug, not a second bug. Any repaint (one `renderer.render` in `resize()`, or a later frame loop) restores the image at any size.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  `src/main.ts` renders the scene exactly once at boot (`renderer.render(scene, camera)`, line 132).
  The `resize` handler (lines 121-127) calls `renderer.setSize(width, height, false)` and updates
  `camera.aspect`/`updateProjectionMatrix`, but never calls `renderer.render` again. `setSize`
  reallocates the WebGL drawing buffer to the new pixel dimensions, and with the default
  `preserveDrawingBuffer: false` the resized buffer is cleared; no draw follows, so the canvas
  presents black (over the `#000` body background) after the first resize. Restoring the original
  window size merely triggers the same handler/setSize again, so the cleared buffer persists — there
  is no render loop or other repaint path to recover it. A render loop is intentionally deferred to
  Phase 3 (`01-01-PLAN.md:157`, `01-03-PLAN.md:196`, ARCHITECTURE.md:51); the Phase 1 defect is
  specifically the missing repaint in the resize handler, independently measured as 0 draws / 0 clears
  after resize (CR-01, still `open` in `01-REVIEW-DISPOSITION.md`).
fix: |
  Not applied (goal: find_root_cause_only).
verification: |
  Source confirmed against src/main.ts; runtime evidence from the recorded in-container probe
  (0 draws / 0 clears after 1280x720 -> 900x600) in 01-REVIEW.md and 01-VERIFICATION.md.
files_changed: []
