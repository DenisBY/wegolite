---
gsd_state_version: "1.0"
current_phase: 06
current_phase_name: Hyperspace, Navigation & Persistence
status: verifying
stopped_at: Completed 06-01-PLAN.md
last_updated: "2026-11-06T21:22:16.859Z"
last_activity: 2026-11-06
last_activity_desc: Phase 06 execution started
state_head: cfbbacf5316b1c6c7d3c295ed982784f1cbf7d82
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 50
  completed_plans: 50
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-06)

**Core value:** A player can launch, fly, dock, and complete a profitable trade run between two star systems entirely in the browser — faithful to Oolite's rules, data, and feel.
**Current focus:** Phase 06 — Hyperspace, Navigation & Persistence

## Current Position

Phase: 06 (Hyperspace, Navigation & Persistence) — EXECUTING
Plan: 6 of 6
Status: Phase complete — ready for verification
Last activity: 2026-11-06 — Phase 06 execution started

Progress: [███████░░░] 71% — 44/44 plans complete

## Performance Metrics

**Velocity:**
- Total plans completed: 44
- Average duration: 5.3 min
- Total execution time: 3.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 7 | - | - |
| 02 | 9 | - | - |
| 03 | 14 | - | - |
| 04 | 8 | - | - |
| 05 | 6 | - | - |

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
| Phase 04 P04 | 44 min | 3 tasks | 19 files |
| Phase 04 P05 | 31 | 3 tasks | 14 files |
| Phase 04 P06 | 15 min | 2 tasks | 8 files |
| Phase 04 P08 | 14min | 2 tasks | 2 files |
| Phase 04 P07 | 17 min | 2 tasks | 9 files |
| Phase 05 P01 | 55 min | 2 tasks | 41 files |
| Phase 05 P02 | 9 min | 2 tasks | 14 files |
| Phase 05 P03 | 9 min | 2 tasks | 4 files |
| Phase 05 P04 | 8 min | 3 tasks | 9 files |
| Phase 05 P05 | 72 min | 2 tasks | 6 files |
| Phase 05 P06 | 36 min | 3 tasks | 9 files |
| Phase 06 P06-01 | 16 min | 3 tasks | 11 files |

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
- [Phase 04]: Plan 04-04: the TL 9 gate compares the raw System.techLevelRaw, so Lave (raw 4) refuses EQ_DOCK_COMP and Phase 5 reuses canPurchase unchanged.
- [Phase 04]: Plan 04-04: the purchase price comes only from the validated catalogue; zero, negative, non-integer and non-finite prices are refused before any credits arithmetic.
- [Phase 04]: Plan 04-04: the dockingComputer command is payload-free; ownership travels through StepOptions.equipment, derived from the profile every frame.
- [Phase 04]: Plan 04-04: every mode-changing command is gated on modeAtStart and terminalTransition suppresses step 5, making launch +600 s and the computer dock +1200 s exact.
- [Phase 04]: Plan 04-04: the panel prefers 'Already fitted' for an owned item while canPurchase keeps techLevel first; purchase durability is handed to 04-05 via onProfileChanged.
- [Phase 04]: Plan 04-05: the save records the post-launch clock (+600 s) and mode docked; the docked pose is derived from the layout and never stored.
- [Phase 04]: Plan 04-05: a version-2+ save is inert - never cleared or replaced; New game starts in memory, the launch write is skipped, and the bytes stay identical.
- [Phase 04]: Plan 04-05: IndexedDB writes resolve on transaction oncomplete through one serialized queue with a monotonic revision; New game awaits a committed delete.
- [Phase 04]: Plan 04-05: the purchase autosave is a direct call, not onProfileChanged, because the ?test=1 seam must taint before any write.
- [Phase 04]: Plan 04-05: VersionError/blocked/quota reports the store unavailable and never calls deleteDatabase.
- [Phase 04]: Plan 04-05: boot builds the equipment, galaxy-0 and station allow-lists at the parseSave call site.
- [Phase 04]: Plan 04-06: the purchase refusal is a span inside the docking-computer value dd, so grid auto-placement cannot move it to the label column; the Buy control describes it through aria-describedby.
- [Phase 04]: Plan 04-06: SHIFT_REQUIRED_ACTIONS is shared action metadata in actions.ts; chordLabel adds the modifier only for display while bindings keep plain KeyboardEvent.code values.
- [Phase 04]: Plan 04-08: the disarmed tunnel-end clamp is asserted as pos + frame.k * shift under a rotated stationAngle, so a world-axis shortcut cannot pass.
- [Phase 04]: Plan 04-08: the bounce block is named for orientation invariance; exactly-one-bounce and bounceCount === 1 remain preconditions for the deep-equal quaternion.
- [Phase 04]: Plan 04-07: New game asks only for valid and corrupt blobs, matching GameSession.canClear; absent, future, unreadable and unavailable keep the one-click path.
- [Phase 04]: Plan 04-07: onStart stores one handler gated by the confirmation requirement; accept is the only route to it while the requirement is set.
- [Phase 04]: Plan 04-07: the shared e2e starter checks #title-confirm visibility, so prompted and unprompted boots use one New-game route.
- [Phase 04]: Plan 04-07: PROJECT.md records the confirmation gate as a refinement of D-14 - the clear still happens, after explicit confirmation.
- [Phase 05]: Plan 05-01: the market formula is Oolite's economy-only shape (quantity before price, four RANROT draws per good including Alien Items, float32 grouping, truncation, stock capped at 127), anchored by Food 38/16 and Computers 902/0 at Lave.
- [Phase 05]: Plan 05-01: the persisted `marketSeed` is derived as `marketSeedForSystem(systemId) = Number.parseInt(fnv1a32("<systemId>:0"), 16) >>> 0`; a `docked` event reuses the in-memory market and Phase 6 owns re-seeding on a system change.
- [Phase 05]: Plan 05-01: cargo is persisted as an entry array, validated by one `validateSaveSemantics` shared by `parseSave` and `isEncodedSaveValid`; capacity is compared before clamping and the Phase 4 berth/missile aliases are folded into counts.
- [Phase 05]: Plan 05-01: the station footer is a `div.station-footer` with four independent fields; the global footer CSS is scoped to `body > footer`, so the document disclaimer stays the only `footer` element.
- [Phase 05]: Plan 05-01: the `.agents` harness directory is excluded from the compliance source walk and Prettier, because it is environment configuration rather than repository source.
- [Phase 05]: Plan 05-02: selling mirrors buying at the same price with `min(held, 127 - stock)`; `planSell` refuses `overflow` before adding proceeds and `applySell` returns `undefined` on every refusal, keeping the caller's profile object identical.
- [Phase 05]: Plan 05-02: clamps run stock -> affordability -> hold and `TradePlan.clamp` reports the last step that strictly reduced the request, so the footer names the binding limit.
- [Phase 05]: Plan 05-02: a zero-stock market row the hold carries stays selectable, or the canonical run (sell Computers at a Lave with 0 stock) would be unreachable; `buildMarketModel.selectable` uses the same predicate.
- [Phase 05]: Plan 05-02: `tests/golden/market/*.json` are REGRESSION snapshots written only by `tests/helpers/write-market-goldens.ts`; the correctness oracle is the hand-derived `reference-vectors.test.ts`, never regenerated from the generator.
- [Phase 05]: Plan 05-03: the D-11 visible set is a money-path boundary; checkFit and applyFit refuse any other catalogue key with notOffered before price, tech or conditions are read.
- [Phase 05]: Plan 05-03: the raw System.techLevelRaw gates (equality allowed); the five single-instance keys delegate tech/owned/credits to canPurchase and append-and-charge to purchase, keeping both Phase 4 predicates on the production path.
- [Phase 05]: Plan 05-03: condition values fail closed (flags true/"true" only, requires_cargo_space integer 0..35); fuel shows (70-fuel)*2 and a full tank is fullFuel before invalidPrice.
- [Phase 05]: Plan 05-03: missile removal charges 200 dc then refunds 300 dc per mounted missile (+700 dc at three); berth removal charges 1000 dc with no refund; missiles cap at 3 and berths at 7 as integer counts.
- [Phase 05]: Plan 05-04: labels.json is validated by LabelsSchema and F7 expands only the four documented value tokens in one literal replacer pass, throwing on any leftover token.
- [Phase 05]: Plan 05-04: F3 removal rows use whole-credit labels while the detail and confirmation keep the decimal price; REMOVAL_DESCRIPTIONS is the truthful removal copy.
- [Phase 05]: Plan 05-04: the F8 confirmation uses TradePlan.cost and the model derives the clamp notice from plan.clamp; tradeNoticeText is the one refusal/clamp copy source.
- [Phase 05]: Plan 05-05: F3 rows are non-focusable model-driven divs; a disabled row stays selectable for its reason but confirmable=false, so KeyY never opens a prompt or reaches applyFit.
- [Phase 05]: Plan 05-05: stationSelection is shared per screen and reset on open; a committed removal clamps the cursor by position to the nearest surviving row, so the next Y meets a disabled row rather than buying a neighbour.
- [Phase 05]: Plan 05-05: probe.station.pending is {kind,key} and probe.economy.lastTrade records the last accepted buy/sell/fit/removal; every field is published before an assertion.
- [Phase 05]: Plan 05-05: the no-reload proof is event.defaultPrevented on synthetic F3/F5/F7/F8 with a body.dataset.capture negative control; the sentinel and navigation count stay secondary.
- [Phase 05]: Plan 05-06: the shared save validator already met the hardened contract from 05-01; this plan proves it with the full reject table, the writer-preserves-previous-bytes case, the old-blob restore and the injected-write-failure browser case.
- [Phase 05]: Plan 05-06: restoreFromSave returns the optional marketSeed; the boot falls back to marketSeedForSystem only when a Phase 4 blob has none, so a reload reproduces every price from the persisted seed.
- [Phase 05]: Plan 05-06: the purity guard resolves the content door by module path (both content/types nesting depths, import type only) and tests its scanner directly; no temporary src/sim probe or probe lock is needed.
- [Phase 05]: The economy is the fidelity anchor: the market, trade and cargo modules are pure and deterministic, so the review gate's only critical finding (CR-01, bulk buys ignoring held tonnes) was fixed without touching a single price.
- [Phase 05]: One save validator serves the boot reader and the autosave writer; an over-capacity snapshot is refused before it replaces the last good blob, which is what keeps a trade accepted in memory from silently diverging from the saved hold.
- [Phase 06]: Hyperspace arithmetic stays integer: fuelCost is 4*dist (1 at dist 0) and jumpTimeSeconds is 576*dist^2, never the 0.4*dist display float (06-01).
- [Phase 06]: The countdown is integer steps with the skip-first-tick encoding; only the commit sets terminalTransition, so refusals and cancels add zero jump time (06-01).
- [Phase 06]: Arrival is a deterministic FNV-1a word per route with the offset on X/Z; no global random source or wall clock (06-01).

### Pending Todos

- [2026-11-05] [testing] Fix compassMode hash omission and negative frame delta — [todo file](.planning/todos/pending/2026-11-05-fix-compassmode-hash-omission-and-negative-frame-delta.md)
- [2026-11-06] [outfitting] Allow Cobra's fourth missile pylon — [todo file](.planning/todos/pending/2026-11-06-allow-cobras-fourth-missile-pylon.md)

### Blockers/Concerns

- [Phase 4] The static dock-port schema's half-extents are not magnitude-bounded (verification warning W-01); harmless with the vendored asset but worth a schema bound if the aperture ever becomes data-driven.
- [Phase 5 → Phase 6] The docking computer's install is proven at the pure-rule level only: Lave is raw TL 4, so the 15000 dc purchase cannot be shown end-to-end until Phase 6 reaches a raw TL 9 system. `checkFit`/`applyFit` delegate to the unchanged Phase 4 predicates; 05-06 records the temporary loss of the browser proof.
- [Phase 5] Two review findings are deferred by decision: the missile-removal confirmation still states only the 20 Cr fee (IN-03; D-15 copy is satisfied and the row description states the full trade-in), and five fixed `waitForTimeout` calls remain in the inert-key browser proofs (IN-04; test-hardening for the e2e flake sweep).
- [Phase 1] 23 code-review findings remain open (0 critical, 11 warning, 12 info) — quality/robustness debt, falsifying a Phase 1 must-have; triage before the next review gate.
- [Phase 2] Byte-determinism of generated assets across arm64 Docker vs amd64 CI is unverified; decide per-image or per-arch comparison.
- [Phase 4] The static dock-port schema's half-extents are not magnitude-bounded (verification warning W-01); harmless with the vendored asset but worth a schema bound if the aperture ever becomes data-driven.
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

Last session: 2026-11-06T17:33:58.455Z
Stopped at: Completed 06-01-PLAN.md
Resume file: None
