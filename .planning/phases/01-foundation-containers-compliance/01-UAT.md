---
status: testing
phase: 01-foundation-containers-compliance
source: [01-VERIFICATION.md]
started: 2026-11-02T00:00:00Z
updated: 2026-11-02T00:00:00Z
---

## Current Test

number: 1
name: Real-GPU visual stability at 1.4e6 m
expected: |
  With `docker compose up preview` serving 4173 on a desktop GPU at 1280x720, the
  starfield fills the frame and the 500 m near box at ~1e5 m is a crisp small
  square with no jitter or z-fighting. The 1.4e6 m marker is sub-pixel by design;
  its placement is proven numerically by `farRelZ` and `farUlp`.
awaiting: user response

## Tests

### 1. Real-GPU visual stability at 1.4e6 m
expected: Open `docker compose up preview` (port 4173) on a desktop GPU at 1280x720. The starfield fills the frame; the 500 m near box at ~1e5 m is a crisp small square with no jitter or z-fighting. The 1.4e6 m marker is sub-pixel by design — its placement and ULP are numeric (`farRelZ`, `farUlp`), not visual. Headless SwiftShader cannot prove discrete-GPU appearance.
result: [pending]

### 2. Hot-reload propagation from a host edit
expected: With `docker compose up app`, edit `index.html` and confirm the browser updates without a reload. On WSL2/macOS repeat with `VITE_USE_POLLING=1`. The suite proves the HMR client is served, not that a host filesystem event reaches Vite. Note WR-01: the polling opt-in is currently not wired into compose, so the WSL2/macOS half cannot work until that is fixed.
result: [pending]

### 3. Legal/editorial adequacy of the licence and trademark posture
expected: Review `LICENSE`, `NOTICE`, `ASSETS.md` and the in-app footer against Oolite's licence (GPL-2.0-or-later code; CC BY-NC-SA 3.0 art and configuration) and Frontier's marks. Confirm the wording is legally sufficient and that Elite/Cobra appear only in the nominative disclaimer.
result: [pending]

### 4. Accept-or-fix decision on CR-01 (resize never repaints)
expected: Resize the loaded shell (e.g. 1280x720 -> 900x600) and decide whether a blank/stale canvas is acceptable for the Phase 1 walking skeleton. Evidence: `src/main.ts:121-132` resizes the drawing buffer and `camera.aspect` but never renders again; probe measured 0 draws / 0 clears after resize. Either accept it explicitly for Phase 1 or raise a fix.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
