---
gsd_state_version: "1.0"
current_phase: 04
current_phase_name: Manual Docking
status: executing
stopped_at: Completed 04-03-PLAN.md
last_updated: "2026-11-05T08:45:53.500Z"
last_activity: 2026-11-05
last_activity_desc: Phase 04 execution started
state_head: dacd9f29b6a2bf0adc87498e4ecc28167511d75a
progress:
  total_phases: 7
  completed_phases: 3
  total_plans: 35
  completed_plans: 33
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-02)

**Core value:** A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser — faithful to Oolite's rules, data, and feel.
**Current focus:** Phase 04 — Manual Docking

## Current Position

Phase: 04 (Manual Docking) — EXECUTING
Plan: 4 of 5
Status: Ready to execute
Last activity: 2026-11-05 — Phase 04 execution started

Progress: [████░░░░░░] 43%

## Performance Metrics

**Velocity:**
- Total plans completed: 30
- Average duration: 4.7 min
- Total execution time: 0.55 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 7 | - | - |
| 02 | 9 | - | - |
| 03 | 14 | - | - |

**Recent Trend:**
- Last 5 plans: 01-03 3 min, 01-04 5 min, 01-05 9 min, 01-06 2 min, 01-07 6 min
- Trend: steady

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 02 P01 | 12 min | 3 tasks | 31 files |
| Phase 02 P02 | 9 min | 3 tasks | 56 files |
| Phase 02 P03 | 10 min | 3 tasks | 28 files |
| Phase 02 P04 | 7 min | 3 tasks | 15 files |
| Phase 02 P05 | 14 min | 3 tasks | 14 files |
| Phase 02 P06 | 21 min | 3 tasks | 14 files |
| Phase 02 P07 | 10 min | 3 tasks | 50 files |
| Phase 02 P08 | 4 min | 3 tasks | 3 files |
| Phase 02 P09 | 5 min | 3 tasks | 12 files |
| Phase 03 P10 | 5 min | 2 tasks | 5 files |
| Phase 03 P13 | 6 min | 2 tasks | 8 files |
| Phase 03 P11 | 10min | 2 tasks | 7 files |
| Phase 03 P12 | 6 | 2 tasks | 8 files |
| Phase 04 P01 | 13 min | 2 tasks | 11 files |
| Phase 04 P02 | 20 min | 3 tasks | 17 files |
| Phase 04 P03 | 30 min | 3 tasks | 19 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Seven phases at standard granularity; research suggested eight — world rendering and flight merged into one phase because the first playable flight is one user-visible capability.
- [Roadmap]: WORLD-06 (hyperspace distance/fuel/jump-time math) scheduled in Phase 6 with NAV-03/NAV-06 so one module owns the fuel rule.
- [Roadmap]: Phase 1 must author the Compose topology from PROJECT.md constraints — research is silent on containers and its own install commands (`npx playwright install`, host `npm ci`) violate the constraint.
- [Roadmap]: Adopt 1/120 s fixed step (ARCHITECTURE.md) over 1/60 s (STACK/PITFALLS); adopt IndexedDB over FEATURES.md's `localStorage` suggestion; tool directory is `tools/oolite-ingest`.
- [Plan 01-07]: Repaint once per non-zero resize event (no loop); publish `renders` from three's `renderer.info.render.frame`; the probe contract stays additive.
- [Phase 02]: Content dictionaries are entry arrays, never objects keyed by plist key, so __proto__ cannot reach a prototype and integer-like keys cannot be reordered.
- [Phase 02]: Manifest rows use repository-relative paths so one row identifies an emitted file in both the committed tree and the mkdtemp regeneration.
- [Phase 02]: podConversion.kilogramsPerUnit is carried metadata only (t=1000, kg=1, g=0.001); Phase 5 owns conversion.
- [Phase 02]: OpenStep reals require digits on both sides of the point; .5, 1., +5 and 1e5 stay strings so no authored value is silently coerced.
- [Phase 02]: ContentError bounds every excerpt at 120 single-line characters and uses declare fields so an absent line/column is genuinely absent, not undefined.
- [Phase 02]: plistToJson projects dictionaries onto Object.create(null) so a __proto__ key stays ordinary data (T-02-11).
- [Phase 02]: Converters take a parsed plist and return bytes; generate.ts owns all file I/O, so converter tests never touch the snapshot.
- [Phase 02]: Galaxy 0 is eager and g1-g7 are seven dynamic ?raw globs; a module-level LAZY_GALAXY_COUNT keeps the dynamic entries in the production build graph.
- [Phase 02]: Normalise FACES/NORMALS vectors at parse time, as Oolite does, so face.normal is a unit vector for smooth weights and the writer.
- [Phase 02]: A wide face consumes all declared indices and matching UV pairs before truncating to three, so the synthetic quad still finds END; real data is triangles.
- [Phase 02]: caseSensitiveNames is true exactly when a NAMES block exists: authored names are identifiers, TEXTURES keys are filenames.
- [Phase 02]: Ship catalogue depth counts like_ship hops, not entries: the pinned anaconda chain has four entries but depth 3, matching the measured value.
- [Phase 02]: The ship catalogue keeps the raw subentities array, stats, roles and custom_views in extras; only is_template/model/market_definition/materials are consumed by the typed record.
- [Phase 02]: The GLB container is ours: a fixed generator string, fixed insertion order and no clock, so a dependency upgrade cannot re-baseline every committed binary.
- [Phase 02]: The reflection alone yields glTF CCW; reversing the authored corner order would make every face a back face, so no winding repair runs after the conversion.
- [Phase 02]: NodeIO.readBinary refuses a GLB with external images, so the independent reader validates through readJSON with the file's own JSON and BIN; the refusal is asserted so textures cannot silently become embedded.
- [Phase 02]: The golden records the writer's float32-exact converted bounds so the assertion is exact, and -0 is normalised to 0 so a bound compares equal to the recorded 0.
- [Phase 02]: Specular maps ride KHR_materials_specular because core glTF has no specular slot; extras.oolite keeps the authored name beside it.
- [Phase 02]: The UV handedness handoff is explicit: v-flip decided by plan 07's asymmetric-PNG fixture, applied in exactly one place if needed.
- [Phase 02]: The texture closure imports EMITTED_ENTRIES rather than restating the entry list, and both directions are fatal: a reference outside the 16-name allowlist and an allowlisted file with no reference each fail the build.
- [Phase 02]: decodePng is header-first and limited to non-interlaced 8-bit colour-type-6 with an 8192 cap; decodeGreyscalePng is a separate path so the colour-type-6 contract stays strict.
- [Phase 02]: emissiveFile is exported from convert/glb.ts and imported by the bake, so the GLB emissiveTexture URI and the written _emissive.png cannot drift apart.
- [Phase 02]: Determinism bans apply only to tools/oolite-ingest/**, never to src/sim or src/render; the safe Math surface (sqrt/min/max/abs/floor/round/ceil/imul/fround) stays unrestricted and is proven to pass.
- [Phase 02]: check-arch-determinism.sh builds the deps stage for linux/arm64 and linux/amd64, regenerates in isolated trees, and uses exit 1 for a byte difference and exit 2 for an unrunnable environment; no force/skip override exists.
- [Phase 02]: The arm64/amd64 byte-identity measurement remains outstanding on this host (no QEMU binfmt); the script's Result line records the gap and the CI invocation rather than claiming a pass.
- [Phase 02]: The sim's content door is type-only (src/content/types.ts); ESLint denies content/index*, content/schemas/** and content/generated/**, and the type-only import is proven to pass both lint and tsconfig.sim.json.
- [Phase 02]: The app validates only the manifest at boot: schemaVersion 1, the format literal and every file row are strict, and a mismatch throws ContentBoundaryError naming the failing path before the renderer exists.
- [Phase 02]: Provenance is proven three ways with a vacuity guard: the third_party/oolite walk, ASSETS.md rows and CHECKSUMS.sha256 agree; public/ copies gained explicit rows even though the walk scopes to third_party/.
- [Phase 03]: Plan 03-10: the planet palette is decoded once through an explicit IEC 61966-2-1 sRGB transfer (not THREE.ColorManagement) so <colorspace_fragment> encodes once and the displayed byte equals Oolite's authored texture byte.
- [Phase 03]: Plan 03-10: the sRGB encode cut is the exact image of 0.04045 (0.0031308049535603713), not the truncated 0.0031308, keeping the transfer pair invertible at its seam.
- [Phase 03]: Plan 03-10: the terminator is Oolite's per-channel smoothstep against terminatorThresholdVector (red saturates first), with the authored ambient added outside the day factor through (0.8,0.8,1.0); NdotL pairs the object-space normal with the object-space sun.
- [Phase 03]: Plan 03-13: src/render/viewport.ts is the only writer of camera.aspect; the SceneManager applies the renderer's CSS size on every camera install (empty, menu, system and swap), so the projection is uniform without a window resize.
- [Phase 03]: Plan 03-13: applyViewport rejects zero, negative, NaN and infinite sizes and leaves the projection byte-identical, so a hidden or minimised window cannot write an Infinity aspect.
- [Phase 03]: Planet surface calibration is measured, not constant: calibrateSurface cuts the field at the land_fraction quantile (0.6499 for Lave), mixHi = 0.66667 * (1 + seaBias) = 0.28581 keeps the snowline reachable, percent_ice drives the polar cap, and uReliefScale 80 is documented presentation tuning.
- [Phase 03]: Calibrated-LDR exposure contract: linear light, NoToneMapping, one sRGB encode, exposure 1; DISPLAY_SUN_INTENSITY 24.25 derived from Oolite's 3.75 radiance and 2.484 pre-exposure takes a lit Coriolis face from ~64 to 190/255
- [Phase 03]: The scene-wide clipping bound is exported (albedo bytes 101/119/139 at NdotL 1.0/0.7/0.5) so every body lit by the one sun, including the Cobra, is bounded rather than assumed safe
- [Phase 03]: Plan 03-14: the planet noise budget is 9 evaluations (surface 6, two sea-gated 1-octave relief taps, cloud 1); RELIEF_SCALE 80 is confirmed (mean shade 0.8519, min 0.4636) and cloud coverage re-pins at 0.26001.
- [Phase 03]: Plan 03-14 halted on G-03-3: the 29-test suite is green in both the 10- and 9-evaluation builds, but the JSON-reporter message-test duration is 160362 ms then 152390 ms against the 133 s gate; the proven dominant cost is ~340 ms of fixed loaded frame time, not the noise evaluations.
- [Quick 261104-oif]: measured at 1280x720 DPR 1 on SwiftShader with two concurrent pages: loaded in-flight frame 369.4 ms (2.71 fps), planet fragment shader ~281 ms of it (flat fragment keeps 38308 triangles/6 calls and runs at 88.4 ms), rest of scene ~30 ms (planet hidden), MSAA 4x real (SAMPLES 4) and worth ~135 ms (antialias:false: 234.6 ms), half resolution saves ~199 ms. The measurement gives a real planet-shading fix ~340 ms of headroom against the 55 ms bar; it does not force a gate revision.
- [Phase 04]: Plan 04-01: the dock aperture is the oolite_coriolis_dock.dat bbox (103.4123 x 241.888 x 250), emitted at build time to src/content/generated/dock-port.json, never typed into src/sim.
- [Phase 04]: Plan 04-01: the contact proxy is the union of hull, tris and faceplate bounds (station-local z -534.298..500), a deliberate conservative box, not the hull-only box.
- [Phase 04]: Plan 04-01: corridor expansion is Oolite's x1.25 loop bounded at 64 iterations with a strict progress check, so degenerate apertures fail SCHEMA instead of hanging.
- [Phase 04]: Plan 04-02: the contact proxy is converted once into the port frame (contactPort z about -1000.2561..+34.0419); 04-03 consumes it with the snapshot centre/axes and never re-projects.
- [Phase 04]: Plan 04-02: dockArmed is a clearance latch that arms only when box.min.z > contactPort.zMax, preserving Oolite's STATUS_LAUNCHING exemption across the Space-skip path.
- [Phase 04]: Plan 04-02: band auto-centre applies the per-tick port-frame delta without dt scaling; one scrape event and one scrapeTicks increment per band tick.
- [Phase 04]: Plan 04-02: the symmetric y auto-centre guard deviates from DockEntity.m:752 and is recorded in PROJECT.md.
- [Phase 04]: Plan 04-03: contact detection is a 15-axis SAT of the ship OBB against contactPort, sharing one predicate with obbsIntersect so the oracle cannot diverge.
- [Phase 04]: Plan 04-03: the armed branch is an exclusive capture/straddle/band/lane/outside pipeline; one response, one count and one velocity rewrite per tick.
- [Phase 04]: Plan 04-03: the probe publishes envelope strength (1 at the trigger instant), never the sinusoidal camera offset; bounceCount is per departure.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1] 23 code-review findings remain open (0 critical, 11 warning, 12 info) — quality/robustness debt, falsifying a Phase 1 must-have; triage before the next review gate.
- [Phase 2] Byte-determinism of generated assets across arm64 Docker vs amd64 CI is unverified; decide per-image or per-arch comparison.
- [Phase 4] Coriolis effective gate geometry and required roll are MEDIUM confidence; measure the dock mesh before hard-coding thresholds. v1 docking damage model (bounce-only vs small hull pool) still undecided.
- [Project] Licence election and trademark posture need a professional legal read before the first public post.
- G-03-3 accepted as a known issue (2026-11-04, `PROJECT.md` Key Decisions): the loaded in-flight frame (369.4 ms at 2.71 fps under SwiftShader) is fill-bound and the planet fragment shader owns ~281 ms; the cheap fixes (`antialias:false` ~135 ms, half resolution ~199 ms) would change the approved look. The message-expiry spec is a correctness wait, so it now has a 300 s ceiling with `workers: 2` pinned; QUAL-01 (60 fps at 1080p, mid-range hardware) stays Phase 7's requirement on a real GPU. Do not re-open the octave budget: `BUDGET_CEILING = 9`.
- [Test infra] `tests/guards/content-boundary.test.ts > removes the probe even when the body throws` runs on Vitest's 5 s default while its five siblings use `180_000`; it timed out at 5 s in one full `verify` run under load and passes in isolation (file 6/6 in 24 s). Give it an explicit timeout — unrelated to 03-14.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261104-oif | Diagnose the loaded per-frame render cost of the Lave flight scene: GL context attributes, MSAA A/B, resolution scaling, hidden-planet arm, and split launch vs in-flight frame timing | 2026-11-04 | ddad140 | [261104-oif-diagnose-the-loaded-per-frame-render-cos](./quick/261104-oif-diagnose-the-loaded-per-frame-render-cos/) |
| 261104-p2m | Stabilise the message-expiry browser gate (300 s wait, `workers: 2` pinned), update the frozen-contract guard, and record G-03-3 as an accepted known issue | 2026-11-04 | 313a2bf | [261104-p2m-stabilize-the-message-expiry-browser-gat](./quick/261104-p2m-stabilize-the-message-expiry-browser-gat/) |

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-11-05T08:45:53.106Z
Stopped at: Completed 04-03-PLAN.md
Resume file: None
