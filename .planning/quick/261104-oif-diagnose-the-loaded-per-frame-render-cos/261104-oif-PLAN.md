---
phase: quick-261104-oif
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - playwright.diag.config.ts
  - tests/diag/frame-cost.spec.ts
  - .planning/quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/261104-oif-PLAN.md
  - .planning/quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/261104-oif-SUMMARY.md
  - .planning/STATE.md
autonomous: true
estimate:
  tokens: 45000
  raw_tokens: 30000
  tasks: 3
  confidence: low
must_haves:
  truths:
    - "The diagnostic harness lives in tests/diag plus playwright.diag.config.ts and is absent from the default Playwright list and from Vitest's include."
    - "Seven measurements exist at 1280x720 DPR 1: A loaded x2 workers, A solo x1 worker, B1 antialias:false, B2 half-resolution, B3 planet hidden, B4 flat planet colour, and A2 loaded x2 workers after the ablations."
    - "Each measured page records at least 40 in-flight frames with per-frame rAF delta, probe mode, flightTime, renders, calls and triangles, plus the launch-phase frames that preceded them."
    - "Every diagnostic source edit in src/app/boot.ts and src/render/bodies/planet.ts is reverted; git diff against the pre-task HEAD is empty for src/."
    - "The SUMMARY carries the GL attribute readout, the launch vs in-flight split, the per-arm table with implied 12.92 s drain wall time, host nproc/loadavg, and an explicit rules-in/rules-out verdict against the 55 ms and 255 ms thresholds."
  artifacts:
    - "playwright.diag.config.ts"
    - "tests/diag/frame-cost.spec.ts"
    - ".planning/quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/261104-oif-SUMMARY.md"
  key_links:
    - "playwright.diag.config.ts testDir (./tests/diag) keeps the harness out of playwright.config.ts's ./tests/e2e default run."
    - "tests/diag/frame-cost.spec.ts reads window.__wegolite (src/app/probe.ts) for mode/flightTime/renders and the #view WebGL2 context for GL attributes; no new production probe field is added."
    - "The SUMMARY verdict feeds the reopened G-03-3 blocker in .planning/STATE.md without changing a frozen constraint."
---

<objective>
Measure where the loaded per-frame render time of the Lave flight scene actually goes, and write a verdict against the G-03-3 cadence gate.

Purpose: plan 03-14 proved that cutting the planet noise budget 16 -> 9 cannot reach the 133 s message-expiry gate; the loaded fixed per-frame cost (~340 ms inferred) dominates. Four advisory reviews agreed the next step is measurement, not another shader cut. This plan buys the numbers needed to choose between a real fix and an honest gate revision.

Output: a committed diagnostic harness that is excluded from the default suite, seven measured arms (GL attributes, launch/in-flight split, A/B/A ablations, host load), every temporary source edit reverted, and a SUMMARY with the results table and an explicit rules-in/rules-out paragraph.

This is diagnostic-only: no product change, no proposal for a fix, and no change to src/app/game-loop.ts, src/sim/time.ts, tests/e2e/hud.spec.ts, playwright.config.ts, SURFACE_OCTAVES, RELIEF_SCALE, or the planet segment counts. No ROADMAP requirement is in scope; the deliverable is measurement plus a written verdict.

Threat surface: none added. The harness only reads local GL/probe values from the app this repository serves and writes gitignored result files; it accepts no user input, adds no dependency, and exposes no new production surface.
</objective>

<execution_context>
@/home/opencode/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/opencode/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/03-flight-in-the-lave-system/03-14-SUMMARY.md
@.planning/debug/e2e-message-expiry-timeout.md
@src/app/boot.ts
@src/app/probe.ts
@src/app/game-session.ts
@src/render/bodies/planet.ts
@playwright.config.ts
@compose.yaml

Baseline facts already established, not re-derived here:
- The 9-evaluation build measures 2.35 fps loaded (425.6 ms per frame) and 152390 ms for the message test against a 133000 ms gate.
- Simulated time advances at fps x 5/120 (src/app/game-loop.ts caps at five 1/120 s steps), so the message drain of 12.92 simulated seconds needs 12.92 x 24 / fps wall seconds: 425.6 ms -> 132.0 s.
- Headless Chromium rasterises on SwiftShader; the e2e suite runs 2 workers on a 4-CPU host.
- src/app/boot.ts creates the renderer with antialias: true, stencil: false, logarithmicDepthBuffer: true, and setPixelRatio(min(devicePixelRatio, 2)).
- Playwright's Desktop Chrome descriptor is 1280x720 with deviceScaleFactor 1, so DPR is 1.
- Every command runs in Docker; no host npm/node/playwright.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build the excluded diagnostic harness and take the solo reference arm</name>
  <files>playwright.diag.config.ts, tests/diag/frame-cost.spec.ts</files>
  <action>
Record the reference tree first: 95fcd9d is the parent of this plan's commit (git rev-parse HEAD^ must print 95fcd9d; this plan is already committed). Every later comparison uses that literal hash, and the only diff it may report at the end is the allowed harness plus this PLAN, the SUMMARY and STATE.md. The working tree must be clean before starting.

Create playwright.diag.config.ts at the repository root. It must be a standalone Playwright config, not an edit to playwright.config.ts, with: testDir "./tests/diag"; fullyParallel true; workers read from process.env.DIAG_WORKERS defaulting to 2; retries 0; reporter [["list"]]; test timeout 240000; the same use block as playwright.config.ts (spread devices["Desktop Chrome"] first, then baseURL "http://127.0.0.1:4173", trace "off", screenshot "off" — keep the spread first so TypeScript does not flag a duplicate viewport); and the same webServer block (npx vite preview --host 127.0.0.1 --port 4173 --strictPort, reuseExistingServer false, timeout 60000). The comment must say this config is invoked explicitly and is deliberately outside ./tests/e2e so `npm run test:e2e` and `docker compose run --rm verify` never run it.

Create tests/diag/frame-cost.spec.ts. Read ARM from process.env.DIAG_ARM (default "baseline") and OUT_DIR from process.env.DIAG_OUT_DIR (default "test-results/diag"). Import test/expect from @playwright/test, mkdirSync/writeFileSync from node:fs, and waitForReady from ../e2e/helpers/probe.js (reuse the existing helper; do not duplicate it). Define TWO tests by looping over the labels "page-1" and "page-2", so that workers=2 runs two pages concurrently and workers=1 runs them sequentially as the solo reference.

Each test performs exactly this measurement, with no assertion of a target frame time:

1. Boot: page.goto("/"), waitForReady(page), page.click("#title-start"), expect(page.locator("#docked")).toBeVisible(). Do not pass ?test=1; the test hook is not needed.
2. Read the GL environment once, in one page.evaluate, from document.getElementById("view"): canvas.getContext("webgl2"), then getContextAttributes(), getParameter(gl.SAMPLES), getParameter(gl.MAX_SAMPLES), drawingBufferWidth, drawingBufferHeight, window.devicePixelRatio, Math.min(window.devicePixelRatio, 2), and — guarded on a null check of getExtension("WEBGL_debug_renderer_info") — the unmasked VENDOR and RENDERER strings. Return all of it as a plain object. If the context or the canvas is missing, throw with a named message; do not silently return nulls.
3. Install the frame sampler and start the launch in the SAME page.evaluate, so launch phase sampling begins on the launch frame: inside the page, resolve the launch button with document.querySelector('button[data-action="launch"]'), throw if it is absent, take startedAt = performance.now(), and start a requestAnimationFrame callback. Each callback appends one record { t: performance.now(), mode: probe.mode, flightTime: probe.flightTime, renders: probe.renders, calls: probe.calls, triangles: probe.triangles } for window.__wegolite. The callback resolves the evaluate when at least 40 records with mode === "inFlight" have been collected, or when 120000 ms have elapsed since startedAt (return truncated: true in that case). Call launch.click() immediately before scheduling the first requestAnimationFrame. Return { startedAt, endedAt, truncated, samples }.
4. In Node, split the samples by mode into docked (expected 0-2 frames), launching and inFlight. Compute for launching and inFlight separately: frame count, mean rAF delta in ms from consecutive t values within that mode, and median delta. For inFlight additionally compute: fps = 1000 / meanDelta; first and last flightTime; simRate = (lastFlightTime - firstFlightTime) / ((lastT - firstT) / 1000); framesPerSimSecond = inFlightFrames / (lastFlightTime - firstFlightTime); impliedDrainSeconds = 12.92 / simRate; loopCapDelta = simRate - fps / 24; mean calls; mean triangles; rendersAdvance = lastRenders - firstRenders.
5. Fail the test if truncated is true or if fewer than 40 in-flight frames were collected. Fail if rendersAdvance is less than inFlightFrames - 2 (the probe must advance once per rendered frame). These are measurement-integrity assertions only, never a performance threshold.
6. Write one JSON file to OUT_DIR named frame-cost-ARM-LABEL-w{testInfo.workerIndex}-{round(startedAt)}.json (unique, so the two sequential solo tests cannot overwrite each other) containing: arm, label, workerIndex, startedAt, endedAt, wallMs, gl, launched (the launch stats), inFlight (the stats), and the raw samples array with the per-frame t, mode, flightTime, renders, calls and triangles. Also console.log exactly one line "DIAG_RESULT " + the same JSON without the raw samples, so the run log carries the headline numbers. Resolve OUT_DIR relative to process.cwd() and mkdirSync it recursive.
7. At the very end, assert no page errors or console errors were recorded (attach the same console/pageerror listeners other specs use) and report them.

TypeScript strictness: this repository has noUncheckedIndexedAccess and exactOptionalPropertyTypes, so index derived arrays defensively and do not introduce possibly-undefined arithmetic. Keep the file Prettier-clean.

Do NOT edit playwright.config.ts, vitest.config.ts, package.json, src/**, tests/e2e/**, or compose.yaml in this task.

Verify exclusion, then take the solo reference arm in the same task (the tree is baseline here, so this run is both the harness smoke test and the A-solo reference):
- Confirm the default Playwright list does not contain frame-cost.
- Run the harness with DIAG_WORKERS=1 and DIAG_ARM=A-solo, which builds the production bundle and runs the two sequential pages (about 2-3 minutes).
- Immediately read the two JSON files it writes and record their headline numbers plus nproc, /proc/loadavg before and after, and the wall-clock duration in your task notes; the next arm's run will clear test-results/diag.

The A-solo numbers are the solo reference arm for the SUMMARY. If the harness cannot complete, fix the harness and re-run before moving on; do not carry a broken harness into Task 2.
  </action>
  <verify>
    <automated>docker compose run --rm e2e sh -lc 'npx playwright test --list > /tmp/e2e-list.txt; if grep -q frame-cost /tmp/e2e-list.txt; then echo LEAKED; exit 1; fi; echo EXCLUDED; export DIAG_WORKERS=1 DIAG_ARM=A-solo; npm run build && npx playwright test --config=playwright.diag.config.ts'</automated>
  </verify>
  <done>playwright.diag.config.ts and tests/diag/frame-cost.spec.ts exist and are clean under lint and typecheck; the default Playwright list prints EXCLUDED; the A-solo run completes with two result files, each with at least 40 in-flight frames; and their numbers are recorded for the SUMMARY.</done>
</task>

<task type="auto">
  <name>Task 2: Run the A/B/A ablation arms with host context, then revert every source edit</name>
  <files>src/app/boot.ts (temporary, reverted), src/render/bodies/planet.ts (temporary, reverted)</files>
  <action>
Run six loaded arms in this exact order: A (baseline, 2 workers), B1 (antialias false), B2 (half-resolution drawing buffer), B3 (planet hidden), B4 (flat planet colour), A2 (baseline again, 2 workers). A2 exists to expose host drift; do not skip it.

Isolation rule for every arm: start by running git checkout -- src/app/boot.ts src/render/bodies/planet.ts so the arm is baseline plus exactly one change. Never run git checkout . or git checkout -- tests/, and never git add or commit anything during this task.

Arm preparation:
- A and A2: no source edit. git diff --stat -- src/ must be empty before the run.
- B1: in src/app/boot.ts change the renderer option antialias: true to antialias: false (one token, around line 52). Do not touch any other renderer option.
- B2: leave boot.ts otherwise baseline, and change renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) to renderer.setPixelRatio(0.5) (around line 85). This is a scaling probe, not a proposed fix.
- B3: in src/render/bodies/planet.ts, immediately after mesh.name = "planet"; add mesh.visible = false;. Do not touch the material, the shaders, SURFACE_SEGMENTS, RING_SEGMENTS or RELIEF_SCALE.
- B4: in src/render/bodies/planet.ts, after the const material = new THREE.ShaderMaterial({...}) assignment and before the mesh is constructed, assign material.fragmentShader to a one-line constant fragment shader whose only body is gl_FragColor = vec4(0.5, 0.5, 0.5, 1.0). Keep the real vertex shader and every uniform; this bounds all planet fragment work while keeping its geometry and draw call.

Run each arm as one Docker command that builds, runs the harness with DIAG_WORKERS=2 and the arm label, and prints the host context around it. Use this shape, substituting ARM: docker compose run --rm e2e sh -lc 'export DIAG_ARM=ARM DIAG_WORKERS=2; echo ARM:ARM; nproc; cat /proc/loadavg; date -u +%s; npm run build && npx playwright test --config=playwright.diag.config.ts; status=$?; date -u +%s; cat /proc/loadavg; exit $status'. The container exit code must be the test exit code, so a failed arm is not masked by the host-context lines.

After EVERY arm, before starting the next one (the next Playwright run clears test-results), read both JSON files from test-results/diag and record in your notes: the arm label, both worker results (mean in-flight frame ms, fps, launch mean, median, frames, mean calls and triangles, implied drain), the GL readout (context attributes, SAMPLES, MAX_SAMPLES, drawingBuffer size, devicePixelRatio, unmasked vendor/renderer), the before/after loadavg and the wall-clock duration. For each arm also confirm the expected evidence is visible: B2 must show drawingBufferWidth/Height 640x360; B1 must show the antialias attribute false (SAMPLES may be 0 in both baseline and B1 under SwiftShader — record it rather than assuming); B3 must show a lower mean triangle count than A; B4 must show the same triangle count as A. If an arm does not show its expected evidence, mark it not measured and say why instead of guessing.

If an arm cannot be measured cheaply within the 240 s test timeout and the 120 s sampler deadline, record it as not measured with the failure text; do not extend the harness to chase it.

After B4, run git checkout -- src/app/boot.ts src/render/bodies/planet.ts, confirm git diff --stat -- src/ is empty, rebuild, and run A2 on the reverted tree. The tree must be source-identical to 95fcd9d at the end of this task; the only untracked/ignored changes are test-results/diag and dist.
  </action>
  <verify>
    <automated>git diff --stat 95fcd9d -- src/ && git status --porcelain -- src/</automated>
  </verify>
  <done>All six loaded arms have been attempted; each measured arm has two concurrent result files with at least 40 in-flight frames and recorded host context; B2 shows 640x360, B3 shows a triangle drop and B4 matches A's triangle count (or the arm is explicitly marked not measured); the final git diff for src/ is empty and only the reverted baseline remains.</done>
</task>

<task type="auto">
  <name>Task 3: Write the SUMMARY verdict, update STATE, and prove the clean tree</name>
  <files>.planning/quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/261104-oif-SUMMARY.md, .planning/STATE.md</files>
  <action>
Write .planning/quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/261104-oif-SUMMARY.md with the standard quick-task frontmatter (phase quick-261104-oif, plan 1, status complete, completed date) and these sections, using the numbers actually measured:

1. A one-paragraph headline stating which component the loaded frame time is dominated by, whether the antialias buffer is real under SwiftShader, and whether the scene is fill-bound.
2. The GL environment readout per arm: context attributes, SAMPLES, MAX_SAMPLES, drawingBufferWidth/Height, devicePixelRatio and the unmasked vendor/renderer. State explicitly what the baseline readout says about antialias: true and whether B2's 640x360 drawing buffer proves the scaling probe landed.
3. The launch vs in-flight split table: per arm, launch mean frame ms and frame count, in-flight mean frame ms and frame count, median, fps, frames per simulated second, simRate, and the loop-cap check (simRate versus fps/24).
4. The results table with exactly these columns: arm, mean in-flight frame ms, fps, implied 12.92 s drain wall time, launch mean ms, mean triangles, mean calls, drawing buffer, SAMPLES, workers. Include A-solo, A, B1, B2, B3, B4 and A2. Use implied drain = 12.92 x 24 / fps and show the arithmetic, not a remembered constant. Mark any unmeasured arm as not measured with the reason.
5. Host context: nproc, loadavg before and after each arm, the arm's wall-clock duration, and whether A2 drifted from A.
6. A "What this rules in / rules out" paragraph applying these thresholds literally: a real fix needs at least 55 ms saved per frame (about 425.6 ms -> at most 371.4 ms); if antialias:false (B1) saves at least 55 ms it is a candidate; if hiding the planet (B3) saves less than 55 ms then no planet-only change can clear the gate; if half resolution (B2) saves about 255 ms the scene is fill-bound. State which threshold each arm does or does not cross, and state the decision that follows for G-03-3 without proposing a product change.
7. Limitations: what the arms do not cover (HUD 2D cost, log-depth cost, GPU-driver differences, menu versus flight), and the per-page sample counts and wall-clock bounds.
8. Verification: the commands actually run, their observed exit status, and the exclusion evidence for the default suite.

Update .planning/STATE.md minimally and factually: add one Decisions bullet beginning "[Quick 261104-oif]" recording the measured verdict; replace the G-03-3 Blockers/Concerns entry with the measured outcome and the remaining decision (real fix versus gate revision); update stopped_at, last_updated and last_activity_desc. Do not edit ROADMAP.md, PROJECT.md, REQUIREMENTS.md or any phase artifact.

Commit in two commits at most: the harness commit (playwright.diag.config.ts plus tests/diag/frame-cost.spec.ts) and the docs commit (SUMMARY plus STATE.md), with messages of the form docs(quick-261104-oif): ... . The final committed tree measured against 95fcd9d may differ only by: playwright.diag.config.ts, tests/diag/frame-cost.spec.ts, the quick task PLAN.md, the quick task SUMMARY.md, and .planning/STATE.md. Prove that with git diff --name-only 95fcd9d, with git diff --stat 95fcd9d -- src/ being empty, and with git status --porcelain being empty.

Run the full authoritative gate once at the end: docker compose run --rm verify. It must be green; note that the harness is not part of it by construction.
  </action>
  <verify>
    <automated>git diff --name-only 95fcd9d && git diff --stat 95fcd9d -- src/ && git status --porcelain && docker compose run --rm verify</automated>
  </verify>
  <done>The SUMMARY contains the GL readout, the launch/in-flight split, the seven-row results table with implied drains, host context, and the rules-in/rules-out verdict against 55 ms and 255 ms; STATE.md records the verdict and the remaining decision; git diff against 95fcd9d lists only the two harness files, the PLAN, the SUMMARY and STATE.md; src/ is byte-identical to 95fcd9d; and docker compose run --rm verify exits 0.</done>
</task>

</tasks>

<verification>
Final checks, all run in Docker from the repository root:

- docker compose run --rm verify exits 0 (lint, typecheck, assets:check, unit tests, build, the 29-test default e2e suite).
- docker compose run --rm e2e npx playwright test --list does not list frame-cost (the harness is outside ./tests/e2e).
- docker compose run --rm test npx vitest list does not list frame-cost (Vitest includes only tests/**/*.test.ts).
- git diff --stat 95fcd9d -- src/ is empty: src/app/boot.ts and src/render/bodies/planet.ts are back to their committed bytes, and no other src file changed.
- git diff --name-only 95fcd9d lists exactly playwright.diag.config.ts, tests/diag/frame-cost.spec.ts, the quick PLAN, the quick SUMMARY and .planning/STATE.md.
- The SUMMARY reports at least seven arms, or explicitly marks any arm not measured with the reason; no number is extrapolated or borrowed.
</verification>

<success_criteria>
- The diagnostic harness is committed, runs only through playwright.diag.config.ts, and never runs as part of npm run test:e2e or docker compose run --rm verify.
- The GL readout decides whether antialias: true allocates an MSAA buffer under SwiftShader; B2 proves the half-resolution scaling probe by its 640x360 drawing buffer.
- The launch and in-flight frame times are reported separately, with at least 40 in-flight frames per measured page, under two concurrent pages plus a solo reference.
- All seven arms (A-solo, A, B1, B2, B3, B4, A2) are measured or explicitly marked not measured; host load and wall clock accompany every arm.
- The SUMMARY applies the 55 ms / 255 ms thresholds literally and states what is ruled in and ruled out for G-03-3, without proposing a product change.
- Every temporary source edit is reverted and the committed tree differs from 95fcd9d only by the allowed harness and documentation files.
</success_criteria>

<output>
Create .planning/quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/261104-oif-SUMMARY.md when done.
</output>
