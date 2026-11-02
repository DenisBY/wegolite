---
status: diagnosed
phase: 01-foundation-containers-compliance
source: [01-VERIFICATION.md]
started: 2026-11-02T00:00:00Z
updated: 2026-11-02T21:16:26.189Z
---

## Current Test

[testing complete]

## Tests

### 1. Real-GPU visual stability at 1.4e6 m
expected: Open `docker compose up preview` (port 4173) on a desktop GPU at 1280x720. The starfield fills the frame; the 500 m near box at ~1e5 m is a crisp small square with no jitter or z-fighting. The 1.4e6 m marker is sub-pixel by design — its placement and ULP are numeric (`farRelZ`, `farUlp`), not visual. Headless SwiftShader cannot prove discrete-GPU appearance.
result: pass
evidence: "User screenshot: starfield fills frame; crisp green near-box square at centre; overlay and disclaimer legible."

### 2. Hot-reload propagation from a host edit
expected: With `docker compose up app`, edit `index.html` and confirm the browser updates without a reload. On WSL2/macOS repeat with `VITE_USE_POLLING=1`. The suite proves the HMR client is served, not that a host filesystem event reaches Vite. Note WR-01: the polling opt-in is currently not wired into compose, so the WSL2/macOS half cannot work until that is fixed.
result: pass
evidence: "User confirmed HMR works at http://localhost:5173 (dev server); the earlier non-update was preview:4173 serving a stale prebuilt dist/."

### 3. Legal/editorial adequacy of the licence and trademark posture
expected: Review `LICENSE`, `NOTICE`, `ASSETS.md` and the in-app footer against Oolite's licence (GPL-2.0-or-later code; CC BY-NC-SA 3.0 art and configuration) and Frontier's marks. Confirm the wording is legally sufficient and that Elite/Cobra appear only in the nominative disclaimer.
result: pass

### 4. Accept-or-fix decision on CR-01 (resize never repaints)
expected: Resize the loaded shell (e.g. 1280x720 -> 900x600) and decide whether a blank/stale canvas is acceptable for the Phase 1 walking skeleton. Evidence: `src/main.ts:121-132` resizes the drawing buffer and `camera.aspect` but never renders again; probe measured 0 draws / 0 clears after resize. Either accept it explicitly for Phase 1 or raise a fix.
result: issue
reported: "when I resize browser window, all \"start\" disapper and don't appear also if restore to original size"
severity: major

## Summary

total: 4
passed: 3
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-01-4
  truth: "Resizing the browser window re-renders the scene, so the starfield stays visible at the new size and after restoring the original size."
  status: failed
  reason: "User reported: when I resize browser window, all \"start\" disapper and don't appear also if restore to original size"
  severity: major
  test: 4
  root_cause: "src/main.ts renders the scene exactly once at boot (line 132). The resize handler (121-127) calls renderer.setSize and updates camera.aspect but never calls renderer.render again. setSize reallocates the drawing buffer, which is cleared with preserveDrawingBuffer:false, so the canvas presents black; restoring the size re-triggers the same clear and there is no render loop or other repaint path."
  artifacts:
    - path: "src/main.ts"
      issue: "resize() has no render call; the only renderer.render is the one-shot boot render at line 132"
    - path: "tests/e2e/precision.spec.ts"
      issue: "no resize coverage; asserts boot-time probe values only, so the defect ships green"
  missing:
    - "Re-render the scene after resizing the drawing buffer (add renderer.render at the end of resize(), guarding zero-size windows)"
    - "Add a browser regression that resizes the viewport and asserts a repaint occurs"
  debug_session: .planning/debug/resize-never-repaints.md
