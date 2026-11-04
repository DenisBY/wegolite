---
phase: quick-261104-oif
plan: 1
subsystem: testing
tags: [playwright, webgl2, swiftshader, performance, diagnostic, planet-shader]
requires:
  - phase: 03-flight-in-the-lave-system
    provides: the loaded Lave flight scene and the additive probe (mode, flightTime, renders, calls, triangles)
provides:
  - playwright.diag.config.ts + tests/diag/frame-cost.spec.ts, excluded from verify and test:e2e
  - seven measured arms (A-solo, A, B1, B2, B3, B4, A2) at 1280x720 DPR 1 under SwiftShader
  - a measured rules-in/rules-out verdict for the G-03-3 cadence gate
affects: [03-flight-in-the-lave-system, G-03-3]
actuals:
  tokens: 5200
  tasks: 3
  commits: 1
key-files:
  created: [playwright.diag.config.ts, tests/diag/frame-cost.spec.ts]
  modified: [.planning/STATE.md]
key-decisions:
  - "The loaded in-flight frame (369.4 ms at 2.71 fps) is dominated by the planet's fragment shader: a flat fragment with identical geometry and 38,308 triangles runs at 88.4 ms."
  - "antialias:true is real under SwiftShader (SAMPLES 4, MAX_SAMPLES 4) and costs ~135 ms per loaded frame; antialias:false is a viable secondary lever."
  - "G-03-3 is reachable by a planet-shading fix (~340 ms of headroom against the 55 ms threshold), so the measurement does not force a gate revision."
duration: 26min
completed: 2026-11-04
status: complete
---

# Quick 261104-oif: loaded per-frame render-cost diagnostic — Summary

**The loaded in-flight frame is 369.4 ms and the planet's fragment shader owns ~281 ms of it; antialias:true allocates a real 4x MSAA buffer worth ~135 ms, and half-resolution saves ~199 ms, so the scene is dominated by the planet's pixel shading rather than geometry, draw calls or fixed scene overhead.**

## 1. Headline

Under the exact e2e conditions (1280x720, deviceScaleFactor 1, `vite preview`, headless Chromium on SwiftShader, two concurrent pages on a 4-CPU host) the loaded in-flight frame costs **369.4 ms mean** (2.707 fps). Replacing only the planet's fragment shader body with a flat grey constant — unchanged vertex shader, uniforms, geometry, draw call, 38,308 triangles and 6 draw calls — drops it to **88.4 ms**, and hiding the planet entirely drops it to **29.9 ms**. The planet's fragment shader (the 9-evaluation noise budget plus relief/cloud mixing) therefore accounts for **~281 ms of the ~369 ms frame (76 %)**, while everything else in the scene costs ~30 ms. The antialias buffer is real under SwiftShader: the baseline context reports `SAMPLES = 4`, `MAX_SAMPLES = 4`, and `antialias:false` (B1) reports `SAMPLES = 0` and saves **~135 ms**. Half resolution (B2) saves **~199 ms**, confirming the cost scales with pixels (fill/shader bound) rather than geometry; the plan's 255 ms marker is not reached only because this harness's baseline is 369 ms rather than the suite's 425.6 ms.

## 2. GL environment readout

Read once per page from `document.getElementById("view").getContext("webgl2")` before launch.

| Arm | antialias attr | SAMPLES | MAX_SAMPLES | drawingBuffer | DPR / capped | unmasked vendor | unmasked renderer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A-solo, A, B3, B4, A2 | `true` | 4 | 4 | 1280x720 | 1 / 1 | `Google Inc. (Google)` | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |
| B1 (antialias:false) | `false` | 0 | 4 | 1280x720 | 1 / 1 | same | same |
| B2 (half resolution) | `true` | 4 | 4 | **640x360** | 1 / 1 | same | same |

All arms: `alpha:true`, `depth:true`, `stencil:false`, `premultipliedAlpha:true`, `preserveDrawingBuffer:false`, `desynchronized:false`, `failIfMajorPerformanceCaveat:false`, `powerPreference:"high-performance"`.

This settles the open question: `antialias:true` is **not** a no-op under SwiftShader. The baseline default framebuffer is genuinely 4x multisampled, B1's context reports zero samples, and B2's 640x360 drawing buffer proves the `setPixelRatio(0.5)` scaling probe landed (canvas stays 1280x720 CSS; drawing buffer halves on both axes, i.e. quarter the pixels).

## 3. Launch vs in-flight split

Per page; the sampler starts on the launch click and stops at 40 in-flight frames, so every arm also records the 48 launching frames that preceded them. Deltas are within-mode consecutive rAF deltas. The loop-cap check is `simRate − fps/24`: 0 means the five-step cap binds exactly (simRate = fps × 5/120); a negative value means fps > 24 and the simulation saturates at ≤ 1.0× wall time.

| Arm | launch frames | launch mean ms (p1/p2) | in-flight frames | in-flight mean ms (p1/p2) | median ms (p1/p2) | fps (p1/p2) | frames per sim-s (p1/p2) | simRate (p1/p2) | loop-cap delta (p1/p2) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-solo | 48/48 | 146.33 / 142.86 | 40/40 | 198.39 / 185.36 | 181.90 / 178.70 | 5.041 / 5.395 | 24.62 / 24.62 | 0.2100 / 0.2248 | −7.5e-16 / −8.3e-16 |
| A | 48/48 | 281.19 / 276.16 | 40/40 | 368.93 / 369.92 | 360.10 / 359.20 | 2.711 / 2.703 | 24.62 / 24.62 | 0.1129 / 0.1126 | ≈0 / ≈0 |
| B1 | 48/48 | 218.99 / 225.84 | 40/40 | 232.34 / 236.91 | 223.30 / 238.90 | 4.304 / 4.221 | 24.62 / 24.62 | 0.1793 / 0.1759 | ≈0 / ≈0 |
| B2 | 48/48 | 116.38 / 118.07 | 40/40 | 167.45 / 173.19 | 164.30 / 168.10 | 5.972 / 5.774 | 24.62 / 24.62 | 0.2488 / 0.2406 | ≈0 / ≈0 |
| B3 | 48/48 | 262.35 / 259.46 | 40/40 | 30.15 / 29.67 | 28.80 / 28.30 | 33.172 / 33.699 | 35.29 / 36.09 | 0.9640 / 0.9577 | −0.4182 / −0.4464 |
| B4 | 48/48 | 262.49 / 263.96 | 40/40 | 89.94 / 86.81 | 86.50 / 80.80 | 11.119 / 11.520 | 24.62 / 24.62 | 0.4633 / 0.4800 | ≈0 / ≈0 |
| A2 | 48/48 | 287.10 / 279.40 | 40/40 | 359.18 / 357.04 | 368.60 / 352.50 | 2.784 / 2.801 | 24.62 / 24.62 | 0.1160 / 0.1167 | ≈0 / ≈0 |

Every arm except B3 advances simulated time at exactly the five-step cap rate, which independently confirms the loop model used by the G-03-3 diagnosis (`simRate = fps × 5/120`). In B3 (fps > 24) the cap stops binding and the simulation reaches 0.96–0.98× wall time — still not 1.0× because 40 frames is a short window and a few frames run fewer than five steps. The launch phase is 48 frames (the scripted two simulated seconds) and does **not** respond to the planet ablations (B3 260.9 ms, B4 263.2 ms vs A 278.7 ms mean), so during the launch cinematic the station/ship close-up, not the planet, is the dominant cost.

## 4. Results

Per-arm means of the two pages. `implied drain = 12.92 × 24 / fps` (12.92 simulated seconds of message drain, 24 frames per simulated second at the five-step cap). B3's fps formula is shown but flagged: at 33.4 fps the cap cannot bind, so the honest projection is the measured simRate drain, `12.92 / 0.9608 = 13.45 s`.

| Arm | mean in-flight frame ms | fps | implied 12.92 s drain wall time | launch mean ms | mean triangles | mean calls | drawing buffer | SAMPLES | workers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A-solo | 191.9 | 5.218 | 12.92 × 24 / 5.218 = **59.4 s** | 144.6 | 38,308 | 6 | 1280x720 | 4 | 1 |
| A | 369.4 | 2.707 | 12.92 × 24 / 2.707 = **114.6 s** | 278.7 | 38,308 | 6 | 1280x720 | 4 | 2 |
| B1 (antialias:false) | 234.6 | 4.263 | 12.92 × 24 / 4.263 = **72.7 s** | 222.4 | 38,308 | 6 | 1280x720 | 0 | 2 |
| B2 (half resolution) | 170.3 | 5.873 | 12.92 × 24 / 5.873 = **52.8 s** | 117.2 | 38,308 | 6 | 640x360 | 4 | 2 |
| B3 (planet hidden) | 29.9 | 33.435 | 12.92 × 24 / 33.435 = 9.3 s (cap-bound: **13.45 s** measured) | 260.9 | 1,828 | 5 | 1280x720 | 4 | 2 |
| B4 (flat planet fragment) | 88.4 | 11.320 | 12.92 × 24 / 11.320 = **27.4 s** | 263.2 | 38,308 | 6 | 1280x720 | 4 | 2 |
| A2 (baseline rerun) | 358.1 | 2.793 | 12.92 × 24 / 2.793 = **111.0 s** | 283.3 | 38,308 | 6 | 1280x720 | 4 | 2 |

Derived deltas against A (369.4 ms): B1 **−134.8 ms**; B2 **−199.1 ms**; B3 **−339.5 ms**; B4 **−281.1 ms**; A2 **−11.3 ms (−3.1 %)**. Every arm was measured; nothing is marked not measured. B2 shows its expected 640x360, B1 shows `antialias:false`/`SAMPLES 0`, B3 shows the triangle drop (38,308 → 1,828), and B4 matches A's triangle and call counts exactly.

Expected-evidence checks: B3's mean triangles fell by 36,480 and mean calls by 1 (the planet draw call disappears); B4 kept both identity metrics unchanged while frame time fell 76 %, which is the strongest single attribution in this run.

## 5. Host context

`nproc = 4` in every container. `/proc/loadavg` is the host's shared value (other containers run on the same host), so it is context, not an isolated measurement. Wall time is the container's `date +%s` around the whole arm (build + both pages).

| Arm | loadavg before | loadavg after | wall | pages |
| --- | --- | --- | --- | --- |
| A-solo | 1.16 0.85 0.95 | 2.47 1.21 1.06 | 38 s (16:44:58–16:45:36Z) | sequential (35.2 s tests) |
| A | not sampled inside the arm; bracketed by 2.47 1.21 1.06 at 16:45:36Z and 5.24 2.17 1.40 at 16:46:40Z | — | 36 s (16:45:57–16:46:33Z) | concurrent |
| B1 | 5.24 2.17 1.40 | 7.17 2.92 1.68 | 28 s (16:46:40–16:47:08Z) | concurrent |
| B2 | 6.68 2.89 1.67 | 6.88 3.18 1.79 | 20 s (16:47:13–16:47:33Z) | concurrent |
| B3 | 6.33 3.12 1.78 | 7.04 3.50 1.94 | 20 s (16:47:38–16:47:58Z) | concurrent |
| B4 | 6.63 3.48 1.94 | 6.92 3.78 2.08 | 23 s (16:48:06–16:48:29Z) | concurrent |
| A2 | 6.37 3.72 2.07 | 7.08 4.16 2.27 | 36 s (16:48:34–16:49:10Z) | concurrent |

A2 (358.1 ms) drifted 3.1 % faster than A (369.4 ms) despite a higher 1-minute load average, so host drift is small relative to every ablation's effect (the smallest is 134.8 ms, ~37 % of the frame). A-solo at 191.9 ms shows the two-page concurrency alone adds ~177 ms per frame.

## 6. What this rules in / rules out

Applied literally to the plan's thresholds (a fix must save ≥ 55 ms per loaded frame; ≈ 425.6 ms → ≤ 371.4 ms; B2 saving ≈ 255 ms would mark a fill-bound scene):

- **B1 (antialias:false) saves 134.8 ms ≥ 55 ms → ruled in as a candidate.** The MSAA buffer is real and independently worth about a third of the frame. A1's absolute baseline here (369.4 ms) already sits at the plan's 371.4 ms line, so the 55 ms rule is applied to the arm deltas rather than to a re-derived absolute.
- **B3 (planet hidden) saves 339.5 ms ≥ 55 ms → the "no planet-only change can clear the gate" clause does not trigger.** The planet is where the cost is, and it has ample headroom: a planet change only needs to recover a sixth of the ~340 ms available to clear the 55 ms bar.
- **B2 (half resolution) saves 199.1 ms, not ≈ 255 ms → the scene is not "255 ms fill-bound" in that absolute sense**, but the B2/B4/B3 triple does establish that the cost is pixel-bound: B4 keeps 38,308 triangles and 6 calls and still falls to 88.4 ms when only the fragment body is flattened; B3 (no planet at all) floors at 29.9 ms. The remaining ~58 ms between B4 and B3 is the planet's rasterisation/depth/MSAA-resolve presence, not its shading.
- **B4 (flat fragment) saves 281.1 ms (76 % of the frame) with geometry unchanged → the planet's fragment shader body is the dominant loaded cost**, and any shader-level fix targets the right component.
- **Decision that follows for G-03-3:** the measurement supports a real planet-shading fix (≈ 340 ms of headroom, well past the 55 ms threshold), with `antialias:false` as a second, independent ~135 ms lever. It does **not** support revising the gate on the ground that no real fix exists. No product change is proposed here; the remaining G-03-3 decision is real fix versus gate revision, and the measurement gives the real-fix branch the headroom it needs.

## 7. Limitations

- **Absolute fps is optimistic vs the authoritative suite.** This harness measures 2.71 fps loaded; the 03-14 suite reported 2.35 fps (425.6 ms). The gap (~13 %) means the 114.6 s drain projection must not be read as a prediction that the gate passes; the relative arm deltas (A vs A2 drift 3.1 %) are the robust result, and the literal thresholds are applied to those deltas.
- **Not covered:** HUD 2D canvas cost, logarithmic-depth buffer cost, real-GPU/driver differences, and menu-versus-flight. All arms are headless SwiftShader at 1280x720 DPR 1 only.
- **Sampling depth:** 40 in-flight frames (1.63–1.64 simulated seconds) and 48 launching frames per page; wall bounds are 12–28 s per page, well inside the 240 s test timeout and 120 s sampler deadline.
- **The launch phase does not respond to the planet ablations** (~261–283 ms in every arm), so drain projections computed from in-flight fps alone under-represent the station/ship close-up the message test also spends time in.
- **B3 and B4 are diagnostic ablations, not product options;** B2's 0.5 pixel ratio is a scaling probe, not a proposed fix. Only B1 and the planet shader are candidate levers.
- The two pages of an arm always start within ~1 s of each other (same launch click flow), so concurrency is steady rather than phase-shifted.

## 8. Verification

Commands actually run (all in Docker from the repository root), with observed results:

- `docker compose run --rm --no-deps lint npx prettier --write playwright.diag.config.ts tests/diag/frame-cost.spec.ts` → both Prettier-clean.
- `docker compose run --rm --no-deps lint npx eslint playwright.diag.config.ts tests/diag/frame-cost.spec.ts` → exit 0.
- `docker compose run --rm --no-deps typecheck` (`tsc -p tsconfig.json && tsc -p tsconfig.sim.json`) → exit 0 after widening `GlReadout.contextAttributes` to the DOM type's optional fields.
- `docker compose run --rm --no-deps e2e sh -lc 'npx playwright test --list …'` → `Total: 29 tests in 11 files`; `grep frame-cost` absent → **EXCLUDED**. (A first pass used `rg`, which is not installed in the e2e image, so the check was vacuously negative; re-run with `grep` and confirmed. Vitest's `npx vitest list` also contains no `frame-cost` → **VITEST_EXCLUDED**.)
- `DIAG_WORKERS=1 DIAG_ARM=A-solo … npx playwright test --config=playwright.diag.config.ts` → `2 passed (35.2s)`, two JSON files.
- `DIAG_WORKERS=2 DIAG_ARM={A,B1,B2,B3,B4,A2} …` → `2 passed` on every arm (25.1 s, 17.2 s, 17.6 s, 20.5 s, 33.3 s respectively); 14 JSON result files copied to `/tmp/opencode/diag-arms`.
- `git diff --stat 95fcd9d -- src/` → **empty**; `git status --porcelain -- src/` → empty. Both temporary edits (`boot.ts` antialias / pixel ratio, `planet.ts` visibility / fragment shader) were reverted and the baseline rebuilt before A2.
- `git diff --name-only 95fcd9d` → `playwright.diag.config.ts`, `tests/diag/frame-cost.spec.ts`, and the quick PLAN (committed); the SUMMARY and STATE.md are written but intentionally left uncommitted for the orchestrator, per the execution instruction.
- `docker compose run --rm verify` → **exit 0**: lint, typecheck, `assets:check`, unit tests, production build and the full default e2e suite (`29 passed (5.0m)`), including `hud.spec.ts › the message line is one clamped line and expires on flightTime` (2.6 m). The harness is not part of this chain by construction (testDir `./tests/e2e`), which is exactly the exclusion this task required.

Harness contract: `test-results/diag/` and `dist/` remain gitignored (`.gitignore` lines 3 and 2); no result JSON, bundle or build artifact entered the tree.

## Deviations from Plan

1. **Docs commit delegated (orchestrator instruction).** The plan's Task 3 asked for a harness commit plus a docs commit. The execution instruction directed this agent not to commit the PLAN, SUMMARY or STATE.md, so only the harness commit was made; the orchestrator commits the documentation. Consequently `git status --porcelain` is not empty at hand-off (SUMMARY untracked, STATE.md modified) and `git diff --name-only 95fcd9d` does not yet list them.
2. **`rg` is not installed in the e2e Playwright image.** The first exclusion check (`if rg -q frame-cost …`) silently treated a missing binary as "no match". Re-ran the check with `grep` and separately listed Vitest; both confirm exclusion. Recorded here so a future harness does not trust a `rg` exit code inside that container.
3. **Arm A's inside-arm loadavg was filtered out of the captured log.** Its host context is recorded from the bracketing readings immediately before and after (Section 5); no arm result depends on it, and every other arm has explicit before/after values.

## Issues Encountered

- The full-suite baseline (425.6 ms / 2.35 fps) and this harness baseline (369.4 ms / 2.71 fps) differ by ~13 %. The cause was not isolated within this diagnostic (it is not a code difference — A2 and A ran on the same tree bytes); it is recorded in Limitations and does not affect the per-arm attribution.

---

*Quick task: 261104-oif*
*Completed: 2026-11-04*

## Self-Check: PASSED

- `playwright.diag.config.ts` — FOUND
- `tests/diag/frame-cost.spec.ts` — FOUND
- `.planning/quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/261104-oif-SUMMARY.md` — FOUND
- Harness commit `ddad140` — FOUND (ancestor of HEAD)
- `git diff --stat 95fcd9d -- src/` — EMPTY
- `git status --porcelain` — only the docs left for the orchestrator (`STATE.md` modified, `SUMMARY.md` untracked)
- `docker compose run --rm verify` — exit 0 (29 e2e tests passed)
