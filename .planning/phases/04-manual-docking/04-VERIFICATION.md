---
phase: 04-manual-docking
verified: 2026-11-05T11:13:59Z
status: human_needed
score: 42/44 must-haves verified
covered_files:
  - .planning/phases/04-manual-docking/04-01-PLAN.md
  - .planning/phases/04-manual-docking/04-01-SUMMARY.md
  - .planning/phases/04-manual-docking/04-02-PLAN.md
  - .planning/phases/04-manual-docking/04-02-SUMMARY.md
  - .planning/phases/04-manual-docking/04-03-PLAN.md
  - .planning/phases/04-manual-docking/04-03-SUMMARY.md
  - .planning/phases/04-manual-docking/04-04-PLAN.md
  - .planning/phases/04-manual-docking/04-04-SUMMARY.md
  - .planning/phases/04-manual-docking/04-05-PLAN.md
  - .planning/phases/04-manual-docking/04-05-SUMMARY.md
  - .prettierignore
  - NOTICE
  - index.html
  - src/app/dock-feedback.ts
  - src/app/game-session.ts
  - src/app/hud-model.ts
  - src/app/mode.ts
  - src/app/probe.ts
  - src/content/dock-port.test.ts
  - src/content/dock-port.ts
  - src/content/equipment.ts
  - src/content/generated/dock-port.json
  - src/content/generated/manifest.json
  - src/content/schemas/dock-port.ts
  - src/input/actions.ts
  - src/input/keyboard.ts
  - src/main.ts
  - src/persistence/autosave.ts
  - src/persistence/idb-store.ts
  - src/persistence/memory-store.ts
  - src/persistence/save.ts
  - src/persistence/store.ts
  - src/render/hud/draw.ts
  - src/render/hud/messages.ts
  - src/render/launch-camera.ts
  - src/sim/commands.ts
  - src/sim/dock/computer.ts
  - src/sim/dock/corridor.ts
  - src/sim/dock/geometry.ts
  - src/sim/dock/hull.ts
  - src/sim/dock/port-frame.ts
  - src/sim/dock/step.ts
  - src/sim/events.ts
  - src/sim/flight/launch.ts
  - src/sim/flight/sanitize.ts
  - src/sim/flight/state.ts
  - src/sim/flight/step.ts
  - src/sim/player/profile.ts
  - src/ui/docked.ts
  - src/ui/title.ts
  - tests/app/dock-feedback.test.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/docking.spec.ts
  - tests/golden/content/dock-port.json
  - tests/helpers/dock-pose.ts
  - tests/input/bindings.test.ts
  - tests/persistence/autosave.test.ts
  - tests/persistence/save.test.ts
  - tests/settings/schema.test.ts
  - tests/sim/dock-cadence.test.ts
  - tests/sim/dock-capture.test.ts
  - tests/sim/dock-computer.test.ts
  - tests/sim/dock-corridor.test.ts
  - tests/sim/dock-hull.test.ts
  - tests/sim/dock-integrated.test.ts
  - tests/sim/dock-no-trap.test.ts
  - tests/sim/dock-transitions.test.ts
  - tests/sim/player-profile.test.ts
  - tools/oolite-ingest/convert/dock-port.test.ts
  - tools/oolite-ingest/convert/dock-port.ts
  - tools/oolite-ingest/generate.ts
covered_digest: "v4:sha256:b40e61b71adff23b4de15de68ad82450c2b0097ea0ad43d55289bbb3285c030a"
behavior_unverified: 2
overrides_applied: 0
deferred:
  - truth: "A player can buy the docking computer at a station whose tech level allows it"
    addressed_in: "Phase 5 (outfitting screen) / Phase 6 (hyperspace to TL 9 systems)"
    evidence: "Phase 5 ECON-05 reuses `canPurchase`; Phase 6 NAV opens systems beyond Lave. Lave is raw TL 4 and correctly refuses; the purchase rule and maths are unit-proven against a synthetic TL 9 record."
behavior_unverified_items:
  - truth: "While disarmed the ship cannot pass the 250 m tunnel end; the clamp is positional only and emits no bounce."
    test: "Place a disarmed in-flight ship with `box.min.z < -geometry.port.depth` (for example `placeShipInPortFrame(..., { nosePastPlane: 300 })`) and call `stepDocking` once."
    expected: "Position clamps so `box.min.z === -geometry.port.depth`; no `bounce`, `docked` or `scrape` event; mode stays `inFlight`."
    why_human: "The code path is present and wired, and an ad-hoc Docker tsx check observed the clamp (-300.0000000000097 -> -250.00000000000455, events [], mode `inFlight`, latch still false), but no committed test exercises it, so the test suite would not catch a regression."
  - truth: "An off-axis or rolled-wrong approach produces exactly one contact response per tick, with orientation unchanged and mode still inFlight."
    test: "Place a wings-across straddle or a hull contact, capture the orientation quaternion, call `stepDocking` once, and deep-compare the orientation."
    expected: "Exactly one `bounce` event; mode `inFlight`; orientation quaternion unchanged."
    why_human: "The one-response, mode and nose-gate clauses are tested, but no committed assertion checks orientation preservation after a bounce. An ad-hoc Docker tsx check observed `unchanged: true` for a straddle bounce."
human_verification:
  - test: "Launch, fly off-axis into the Coriolis, and observe the bounce."
    expected: "A clear message, camera shake and red HUD frame; all three clear within about 0.5 s; a second attempt is possible immediately."
    why_human: "Shake amplitude/duration and flash feel are qualitative; automation only proves presence and expiry on the sim clock."
  - test: "Dock at Lave and inspect the docking-computer line, the disabled Buy control and the Controls screen."
    expected: "The line reads 'Docking Computers — 1500.0 Cr (TL 9)', the refusal reads 'Requires TL 9', the disabled control is visually distinct, and the Controls screen tells the player the chord is Shift+C."
    why_human: "Layout, colour and discoverability are visual judgements. The UI review reports the Controls label currently renders 'C' rather than 'Shift+C', the disabled Buy control looks active, and the reason sits in the label column."
  - test: "With a committed save, click New game once."
    expected: "Either a confirmation/one-slot backup before the only save is deleted, or an explicit product decision that one-click deletion is intended."
    why_human: "This is a product/UX decision, not a DOCK-01..07 functional assertion. The current path deletes the only save with no confirmation, undo or backup; the UI review rates it a blocking UX defect."
  - test: "Add and run a committed regression test for the disarmed tunnel-end clamp."
    expected: "A disarmed ship past the 250 m tunnel end is clamped positionally, emits no bounce/docked/scrape event and stays in flight."
    why_human: "No committed test exercises this behaviour; an ad-hoc check passed on this tree. The gap is test coverage, not observed product failure."
  - test: "Add and run a committed regression test asserting orientation is unchanged after a straddle/hull bounce."
    expected: "The orientation quaternion is deep-equal before and after the bounce."
    why_human: "No committed assertion exists; an ad-hoc check passed on this tree. The gap is test coverage, not observed product failure."
---

# Phase 4: Manual Docking Verification Report

**Phase Goal:** The player can dock a Cobra by hand with real feedback and real risk, and can buy a docking computer when they would rather not.
**Verified:** 2026-11-05T11:13:59Z
**Status:** human_needed
**Re-verification:** No — initial verification

## MVP-Mode Note

ROADMAP.md marks this phase `Mode: mvp`, but the phase goal is not in the `As a …, I want …, so that …` form (`gsd-tools query user-story.validate` returns `valid: false`). Standard goal-backward verification was therefore used, as requested. If MVP user-flow UAT framing is required, run `/gsd-mvp-phase 04` to reformat the goal first; this is a process discrepancy, not a product gap.

## Goal Achievement

The phase goal is achieved in the codebase. The aperture and corridor are measured from the vendored Coriolis dock mesh and drift-checked; an aligned, correctly rolled approach docks on Oolite's weighted capture plane with the exact mouth pose; a sloppy approach bounces once, gives a message, camera shake and a red HUD frame, and recovers to flight immediately; the docking computer is TL-gated, costs the catalogue price and docks instantly on Shift+C for exactly +1200 s; and launching writes a committed IndexedDB autosave that Continue restores, with future/unreadable blobs left inert.

The full Docker gate was green on this tree: lint, typecheck, `assets:check`, **686 unit tests across 68 files**, production build, and **46 Playwright tests**.

Two must-have truths are present and wired but lack a committed behavioural test (disarmed tunnel-end clamp; orientation preservation through a bounce). Ad-hoc Docker checks exercised both successfully. They are not product failures; they are regression-coverage gaps.

The one UI-review blocker — New game deletes the only save on one click with no confirmation or backup — is real and should be fixed before shipping, but it does not violate DOCK-07's autosave/resume contract: the launch write and Continue restore are verified, New game is by design a clear action (D-14), and the clear is refused for future/unreadable/unavailable blobs. The phase goal's "real risk" refers to docking contact risk (bounce/scrape), not save deletion. It is recorded as a human/product decision below rather than a failed must-have.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 04-01.1 | The aperture (103.4123 × 241.888 × 250) is measured at build time from `third_party/oolite/Models/oolite_coriolis_dock.dat`, never typed into `src/sim/`. | ✓ VERIFIED | `src/content/generated/dock-port.json` carries the three measured extents; the emitter reads the dock mesh; `rg` finds no `103.4123`/`241.888` literal under `src/sim`. |
| 04-01.2 | The emitter writes `src/content/generated/dock-port.json` at the repository-relative path, and the manifest carries that exact path. | ✓ VERIFIED | `DOCK_PORT_PATH` defined in `convert/dock-port.ts`; `manifest.json` has a row with that exact path, 514 bytes and the matching hash; unit test pins the path row. |
| 04-01.3 | Corridor half-extents (ww 51.70615, hh 120.944) are derived at build time with a bounded expansion loop and byte-pinned in the golden. | ✓ VERIFIED | Generated and golden JSON agree; `corridorHalfExtents` has a 64-step cap and progress check; emitter test asserts byte equality with both golden and generated bytes. |
| 04-01.4 | The contact proxy covers the union of hull, tris and faceplate bounds, reaching station-local z −534.298 and +500; it is a box. | ✓ VERIFIED | `contact` is the union of the three `stationBox` values; test asserts `zMin <= -534.2979`, `zMin <= hull.zMin`, and `zMax ≈ 500`; emitter and PROJECT.md state it is a conservative box. |
| 04-01.5 | Every emitted box has finite components, ordered axes and a positive span; zero, negative, NaN, Infinity, subnormal, reversed and degenerate input is rejected by the schema. | ✓ VERIFIED | Boxes require positive finite half-extents and `zMin < zMax`; the ship box requires `min < max` on all axes; the port dimensions have a `[1e-3, 1e5]` range and the reject table covers zero, negative, NaN, Infinity, subnormal, MAX_VALUE, reversed and degenerate cases. **Caveat:** box/corridor half-extents have no magnitude bound, so a forged record with `Number.MIN_VALUE`/`Number.MAX_VALUE` half-extent is accepted (see Findings, W-01). The dangerous aperture/expansion inputs are bounded; committed data is 500/51.70615. |
| 04-01.6 | `assets:check` fails if the emitted `dock-port.json` drifts from the vendored `.dat`. | ✓ VERIFIED | `docker compose run --rm assets npm run assets:check` reports `no differences`; `tools/oolite-ingest/drift.test.ts` proves CHANGED/MISSING/hash drift are reported; the file is in the generated root scanned by `EMITTED_ROOTS`. |
| 04-02.1 | A Cobra rolled to the slot and centred on the opening docks on the tick where `0.90*max.z + 0.10*min.z < 0`, with the docked pose equal to `dockMouthPosition(layout)`. | ✓ VERIFIED | `tests/sim/dock-capture.test.ts#docks an aligned centred approach…` asserts mode, `dockCount`, deep-equal position and exact event; `classifyCorridor` implements the weighted plane. |
| 04-02.2 | The corridor is the port-frame bounding box of the ship against the measured aperture, not a trigger sphere; all four strict inequalities hold at stationAngle 0, π/4, π/2 and π. | ✓ VERIFIED | `tests/sim/dock-corridor.test.ts#is identical at stationAngle…` asserts all four inequalities and lane outcome at the four phases. |
| 04-02.3 | Classification follows DockEntity.m:691-773: past-end reject, lane (no nose gate), then the 1.5× safety footprint under `box.min.z < 0`; a non-lane tick with `min.z >= 0` is outside with no band correction, straddle or scrape. | ✓ VERIFIED | `src/sim/dock/corridor.ts` order; boundary tests assert `min.z == 0 => outside`, `-1e-9 => band`, wings-across at 500 m => outside with no event. |
| 04-02.4 | The emitted station-local contact box is converted to port coordinates once in `createDockGeometry` (z ≈ −1000.2561 … +34.0419). | ✓ VERIFIED | `geometry.ts` conversion; `dock-capture.test.ts` pins the bounds and rejects non-positive `dockOffset`; `hull.ts` never re-projects it. |
| 04-02.5 | Arming is evaluated while disarmed; after natural or skipped launch the ship arms once `box.min.z > contactPort.zMax`, and a later aligned return docks. | ✓ VERIFIED | `stepDocking` arming branch; natural and skipped-launch tests assert the exact threshold, no self-dock/scrape, and a later return docking once. |
| 04-02.6 | Roll acceptance is computed over the committed Cobra corners: 30° fits, 35° does not, limit ≈ 31.296°. | ✓ VERIFIED | `dock-corridor.test.ts` derives the crossing by bisection and asserts the range and the 30/35 pair; no round-number fixture remains. |
| 04-02.7 | Inside the 1.5× safety band with the nose past the plane, the ship is shifted toward the port centre each fixed tick; roll tolerance comes only from the bbox. | ✓ VERIFIED | Band branch applies the per-tick delta; `#shifts a +x band ship…` asserts position delta and one scrape; the y-guard symmetry test is present. |
| 04-02.8 | Speed never gates docking: the same aligned capture-plane pose docks at 0, `maxSpeed` and the torus cap. | ✓ VERIFIED | `tests/sim/dock-capture.test.ts#has no speed term…` asserts identical mode, pose, count and events at all three speeds. |
| 04-02.9 | Replay is hash-identical at 60/120/144 Hz and non-vacuous (`dockCount === 1`, `scrapeTicks > 0`). | ✓ VERIFIED | `tests/sim/dock-cadence.test.ts` asserts one hash across cadences and both counters. |
| 04-02.10 | While disarmed the ship cannot pass the 250 m tunnel end; the clamp is positional only and emits no bounce. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `step.ts` clamps `box.min.z < -port.depth` along `k` and returns no events. No committed test exercises it. An ad-hoc Docker check observed −300.0000000000097 → −250.00000000000455, `events: []`, mode `inFlight`, latch still false. See `behavior_unverified_items`. |
| 04-03.1 | An off-axis or rolled-wrong approach gives exactly one contact response per tick: reflected velocity with damping, orientation unchanged, mode inFlight; a nose-at-or-in-front tick gives no straddle/band/capture response. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The exclusive pipeline, one-response count, mode and nose gate are tested (`dock-hull`, `dock-no-trap`, `dock-integrated`), and `respondToContact` never writes orientation. **No committed test asserts orientation equality.** An ad-hoc Docker check observed `unchanged: true` for a straddle bounce. |
| 04-03.2 | Contact detection is a 15-axis SAT of the ship OBB against the port-frame contact box, finding edge/face intersections with no corner inside. | ✓ VERIFIED | `hull.ts` fixed axis order with degenerate-axis skip and earliest-tie; `dock-hull.test.ts#finds an edge intersection…` builds the crossing and asserts contact + unit normal. |
| 04-03.3 | The proxy is the once-converted `contactPort`; a ship 200 m in front, outside the safety band, is not in contact. | ✓ VERIFIED | `hullContact` consumes `snapshot.centre/axes` and `geometry.contactPort`; the 200 m test asserts classifier `outside` and both `hullContact === null` and `obbsIntersect === false`. |
| 04-03.4 | A launch followed by straight departure emits no contact response, natural or Space-skipped. | ✓ VERIFIED | `dock-hull` natural-departure test, `dock-integrated` natural and skipped scenarios, and the e2e skip path all assert `bounceCount === 0` through and past the arming tick. |
| 04-03.5 | The integrated chain launch → clearance → off-axis bounce → retry → dock asserts `dockCount === 1`, `bounceCount === 1`, mode docked, and zero bounces throughout departure. | ✓ VERIFIED | `tests/sim/dock-integrated.test.ts#launches, departs cleanly…` asserts exactly those values. |
| 04-03.6 | Scrape, bounce, docked and dockDenied are sim events carrying their facts; copy, shake and flash live app-side. | ✓ VERIFIED | `events.ts` union; `game-session.ts` maps `bounce`/`scrape`/`dockDenied` to fixed copy and `dock-feedback`; no UI copy in the sim. |
| 04-03.7 | Shake lasts 0.35 s and flash 0.40 s on the sim `flightTime`, are deterministic, and publish envelope strength (not a sinusoid). | ✓ VERIFIED | `dock-feedback.ts` constants; unit tests assert strength 1 at trigger, linear expiry and determinism; e2e asserts `shake > 0`/`flash > 0` immediately and both 0 after 0.6 s. |
| 04-03.8 | The no-trap oracle asserts non-penetration, outward separation and retry-ability, not only mode plus finiteness. | ✓ VERIFIED | Seeded fast-check property plus adversarial seeds for zero-speed straddle, straddle+hull, deep centre; asserts `obbsIntersect` false after resolution and movement within 30 ticks. |
| 04-03.9 | A non-finite or absurd hook value is repaired at the start of `stepFlight`, and speed can never integrate position to Infinity. | ✓ VERIFIED | `sanitizeFlightState` at the top of `stepFlight`; tests inject `1e308` and NaN and assert finite position, speed ≤ `maxSpeed*1024`, deterministic repair. |
| 04-03.10 | `scrapeTicks` increments exactly once per emitted scrape event. | ✓ VERIFIED | `dock-no-trap.test.ts#increments scrapeTicks exactly once…` counts events and compares. |
| 04-04.1 | `canPurchase` enforces raw `System.techLevelRaw`; Lave (raw 4) refuses the TL 9 computer and the panel says why; "(TL 9)" is a real gate. | ✓ VERIFIED | `canPurchase` compares raw TL; Lave-vs-synthetic-TL9 unit pair; browser asserts "Requires TL 9" and a disabled Buy; `system.techLevelRaw` is read from the loaded System record. |
| 04-04.2 | The price is read from the validated equipment catalogue by key; zero, negative, non-integer or non-finite prices are refused; no command price is trusted. | ✓ VERIFIED | `purchase`/`canPurchase` validate the catalogue record before arithmetic; reject tests; the command is payload-free. |
| 04-04.3 | A new game has 1000 decicredits; 15000 succeeds leaving 0, 14999 is refused, owned is refused, and credits never go negative. | ✓ VERIFIED | `player-profile.test.ts` asserts the boundary pair, owned refusal, double-purchase refusal and safe-integer bounds. |
| 04-04.4 | Shift+C inside the aegis with the computer docks on the same tick, adds exactly 1200 s, emits `docked{via:"computer", clockDelta:1200}`, and increments tick by 1 while flightTime/stationAngle do not advance. | ✓ VERIFIED | `dock-computer.test.ts` and the four-row `dock-transitions.test.ts`; e2e asserts `probe.dock.lastClockDelta === 1200`. |
| 04-04.5 | Outside the aegis, without the computer, or when the mode at tick start is not inFlight, Shift+C emits dockDenied or nothing and changes neither mode nor clock. | ✓ VERIFIED | `dock-computer.test.ts` covers each case; browser covers the beyond-aegis message. |
| 04-04.6 | Commands are gated on `modeAtStart`, so a dock and a launch in one tick cannot both take effect. | ✓ VERIFIED | `stepFlight` gates launch/skipLaunch/dockingComputer; same-tick `[dockingComputer, launch]` test asserts one transition and +1200 only. |
| 04-04.7 | Docking resets the torus drive and impulse, so a docked ship never carries an engaged drive or residual velocity. | ✓ VERIFIED | `dockWithComputer` resets both and the test starts with an engaged torus and speed 120; manual capture performs the same reset in `stepDocking`. |
| 04-04.8 | The keyboard emits a fresh command object per keydown; no shared EDGE_COMMANDS entry is mutated. | ✓ VERIFIED | `keyboard.ts` pushes `{ ...command }`; `bindings.test.ts` asserts distinct object identity and chord behaviour. |
| 04-05.1 | Launching writes a versioned JSON autosave (version, mode docked, post-launch +600 s clock, credits, equipment, system id, station key) to db `wegolite`, store `saves`, key `autosave`; a purchase writes the same shape. | ✓ VERIFIED | Constants in `store.ts`; `snapshotForSave` tests assert the post-launch clock and identities; real-IDB e2e asserts the committed launch clock; purchase snapshot test asserts reduced credits and equipment. |
| 04-05.2 | A future-version blob is never cleared or replaced; New game starts fresh without touching it, the launch write is skipped, and bytes are identical after New game and after a launch. | ✓ VERIFIED | `parseSave` returns future before schema; `canOverwrite`/`canClear` exclude future; e2e injects version 2 and asserts exact bytes after both actions. |
| 04-05.3 | A write is durable only on transaction `oncomplete`; reads/writes are serialized through one queue; a monotonic revision makes stale completions a no-op. | ✓ VERIFIED | `idb-store.ts` resolves on `oncomplete` and rejects on abort/error; `MemorySaveStore` and e2e committed-write reload prove the ordering; revision tests ignore a late old write. |
| 04-05.4 | A tainted profile (any `?test=1` mutation) is never autosaved; the skip is observable. | ✓ VERIFIED | Hook mutations set `testTainted`; `autosave()` skips and publishes `skipReason: "tainted"`; e2e asserts zero writes/commits and null raw. |
| 04-05.5 | Oversized raw data is rejected before `JSON.parse`; boot never parses an unbounded string. | ✓ VERIFIED | `MAX_SAVE_CHARS` length check precedes parse; unit spy proves parse is not reached; 1 MB e2e boots inert. |
| 04-05.6 | `parseSave` receives equipment, system and station allow-lists at the boot call site, so an unknown key cannot reach `findShip`. | ✓ VERIFIED | `main.ts` builds all three from validated sources and passes them; unit reject rows cover unknown equipment/system/station. |
| 04-05.7 | `clockSeconds` is an integer in a bounded safe range; 1e308 is rejected. | ✓ VERIFIED | `SaveV1Schema` `.int().min(CLOCK_START).max(CLOCK_START + 1e12)`; reject row for 1e308; `snapshotForSave` floors. |
| 04-05.8 | A `VersionError` on open never calls `deleteDatabase`; the store reports unavailable and the game runs without saves. | ✓ VERIFIED | `idb-store.ts` maps `VersionError` to `unavailable`; no `deleteDatabase` in `src`; `canOverwrite`/`canClear` refuse. An ad-hoc Docker fake-factory check observed `read {kind:"error",reason:"version"}` and write/clear `committed:false, reason:"version"`. |
| 04-05.9 | A corrupt blob is copied to `autosave.corrupt` by an explicit adapter operation, best effort, exactly when `parseSave` returns corrupt, and is never read back. | ✓ VERIFIED | `main.ts` calls `backupCorrupt` only in the `corrupt` branch; `boundCorruptBackup` keeps it bounded; e2e asserts the backup for a v1-shaped invalid blob and no backup for unreadable/future. |
| 04-05.10 | Docking does not autosave. | ✓ VERIFIED | e2e manual-dock case asserts `attempts === 1` (launch only) and `writes === 1`; computer-dock case asserts `attempts === 1`. |

**Score:** 42/44 truths verified (2 present, behaviour-unverified).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | A player cannot buy the docking computer at Lave because Lave's raw TL is 4; the purchase path is unit-proven on a synthetic TL 9 system and the browser proves the refusal. | Phase 5 / Phase 6 | Phase 5 ECON-05 reuses `canPurchase`; Phase 6 NAV opens systems beyond Lave. This is faithful TL gating, not a broken purchase rule. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `tools/oolite-ingest/convert/dock-port.ts` | `emitDockPort`, `DOCK_PORT_PATH`, bounded corridor, contact union | ✓ VERIFIED | Present, substantive, called by `generate.ts`; golden test passes. |
| `src/content/generated/dock-port.json` | measured port/corridor/hull/contact/ship numbers | ✓ VERIFIED | Present; manifest row; consumed by the loader. |
| `src/content/schemas/dock-port.ts` | strict shared `DockPortSchema` | ✓ VERIFIED | Used by emitter and loader; reject tests. |
| `src/content/dock-port.ts` | typed `loadDockPort()` | ✓ VERIFIED | Wired into `game-session.start`. |
| `tests/golden/content/dock-port.json` | byte-exact emitter golden | ✓ VERIFIED (test-only) | Byte-equal to generated output. |
| `src/sim/dock/geometry.ts` | `DockGeometry` incl. `contactPort`, `createDockGeometry`, error | ✓ VERIFIED | Imported by session and step; bounds pinned. |
| `src/sim/dock/port-frame.ts` | `portFrame(layout, stationAngle)` | ✓ VERIFIED | Used by corridor/snapshot. |
| `src/sim/dock/corridor.ts` | snapshot, bounded aperture, classifier | ✓ VERIFIED | Used by step and tests. |
| `src/sim/dock/step.ts` | `stepDocking` with arming and exclusive response | ✓ VERIFIED | Called by `stepFlight`. |
| `src/sim/flight/state.ts` | dockArmed/dockCount/scrapeTicks/impulse/bounceCount/repairCount | ✓ VERIFIED | Serialized and hashed; probe reads. |
| `tests/helpers/dock-pose.ts` | port-frame poses and computed roll limit | ✓ VERIFIED (test-only) | Used by sim tests and integrated chain. |
| `src/sim/dock/hull.ts` | `hullContact` + `obbsIntersect` | ✓ VERIFIED | Used by `stepDocking`; no-trap oracle shares it. |
| `src/sim/flight/sanitize.ts` | `sanitizeFlightState` | ✓ VERIFIED | Called at the top of `stepFlight`. |
| `src/app/dock-feedback.ts` | shake/flash envelopes + scrape throttle | ✓ VERIFIED | Used by session, HUD, camera and probe. |
| `tests/sim/dock-no-trap.test.ts` | seeded no-trap property | ✓ VERIFIED (test-only) | Passes in the full suite. |
| `src/sim/player/profile.ts` | profile, purchase, credits | ✓ VERIFIED | Used by session and tests. |
| `src/sim/dock/computer.ts` | `dockWithComputer` | ✓ VERIFIED | Called by `stepFlight`; +1200 tested. |
| `src/content/equipment.ts` | `loadEquipment`, `findEquipment` | ✓ VERIFIED | Used by main and session; catalogue validated. |
| `src/sim/flight/step.ts` | `StepOptions.equipment` + terminal clamp | ✓ VERIFIED | Wired in session; transition matrix. |
| `tests/sim/dock-transitions.test.ts` | four-row transition matrix | ✓ VERIFIED (test-only) | Asserts mode/tick/flightTime/stationAngle/clock. |
| `src/persistence/save.ts` | `SaveV1`, `parseSave`, `encodeSave`, bounds | ✓ VERIFIED | Used by boot/autosave; reject table. |
| `src/persistence/store.ts` | SaveStore port and constants | ✓ VERIFIED | Implemented by memory/IDB adapters. |
| `src/persistence/memory-store.ts` | revision-ordered memory adapter | ✓ VERIFIED | Used by unit tests. |
| `src/persistence/idb-store.ts` | serialized, commit-only IndexedDB adapter | ✓ VERIFIED | Used by `main.ts`; e2e real IDB. |
| `src/persistence/autosave.ts` | snapshot/queue/restore | ✓ VERIFIED | Wired into session/boot. |
| `tests/e2e/autosave.spec.ts` | committed reload + future bytes | ✓ VERIFIED (test-only) | 12 real-IndexedDB cases pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `generateContent` | emitted `DOCK_PORT_PATH` | `emitted[]` + manifest | ✓ WIRED | Manifest row exists; `assets:check` scans it. |
| `loadDockPort()` | `createGameSession` | `start()` load | ✓ WIRED | Geometry built once and passed in. |
| `StepOptions.dock` | `stepDocking` | `stepFlight` every step | ✓ WIRED | Called after station-angle update. |
| `dockSnapshot` | `classifyCorridor` / `hullContact` | shared snapshot | ✓ WIRED | One frame, same corners/centre/axes. |
| `SimEvent docked` | `handleEvent` | `docked.show()` + HUD hide | ✓ WIRED | Browser observes the panel. |
| Shift+C chord | `dockingComputer` command | `stepFlight` `modeAtStart` gate | ✓ WIRED | Unit + e2e. |
| `profile.equipment` | `StepOptions.equipment` | session each frame | ✓ WIRED | `hasComputer` derived from the set. |
| buy control | `canPurchase` → `purchase` → credits | session handler | ✓ WIRED | Re-checked in the click path; autosave after success. |
| `launched` event | `snapshotForSave` → `queueAutosave` | session `autosave()` | ✓ WIRED | Commit resolves the write; e2e reload. |
| boot read | `parseSave` → Continue | `main.ts` allow-lists | ✓ WIRED | Unknown keys rejected; title reads the status. |
| `testTainted` | autosave skip | `autosave()` guard | ✓ WIRED | Probe publishes `skipReason`. |
| `future`/`unreadable`/`unavailable` | clear/write skip | `canClear`/`canOverwrite` | ✓ WIRED | Future bytes are e2e byte-identical. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `dock-port.json` → `stepDocking` | port/corridor/contact | Build-time `.dat` measurement | Yes — generated from the vendored mesh, drift-checked | ✓ FLOWING |
| `profile.credits` → docked panel | credits | Session `PlayerProfile` after launch/purchase | Yes — live balance, not a constant | ✓ FLOWING |
| `docked` event → docked panel | docked view | Sim event on capture/computer dock | Yes — panel shown and refreshed | ✓ FLOWING |
| `launched` → IndexedDB | save blob | Post-`beginLaunch` state/profile | Yes — real IDB commit, reload restores clock | ✓ FLOWING |
| `testTainted` → autosave | skip reason | Hook mutation | Yes — e2e observes skip | ✓ FLOWING |
| key chord → `dockWithComputer` | `hasComputer`, aegis | Profile set + layout | Yes — denies outside aegis / without equipment | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full phase gate | `docker compose run --rm verify` | lint, typecheck, `assets:check`, 686 tests/68 files, build, 46 e2e all pass | ✓ PASS |
| VersionError handling | one-off `docker compose run --rm -v /tmp/wegolite-verify:/tmp/wegolite-verify test npx tsx /tmp/wegolite-verify/version-error-check.ts` with a fake `IDBFactory` returning `VersionError` | `read {kind:"error",reason:"version"}`, write/clear `committed:false, reason:"version"` | ✓ PASS |
| Disarmed tunnel clamp | one-off tsx check placing a disarmed ship at `nosePastPlane: 300` | `box.min.z` −300.0000000000097 → −250.00000000000455; `events: []`; mode `inFlight`; latch false | ✓ PASS (ad-hoc; no committed test) |
| Orientation preserved on bounce | one-off tsx check with a wings-across straddle at speed 100 | one `bounce` (straddle, z); `unchanged: true`; mode `inFlight` | ✓ PASS (ad-hoc; no committed test) |
| Schema magnitude bounds | one-off tsx check of `DockPortSchema` extremes | `hull.halfX` MIN_VALUE/MAX_VALUE accepted; `corridor.ww` MIN_VALUE accepted; `port.width` MIN_VALUE rejected | ⚠️ FINDING (W-01) |

### Probe Execution

N/A — no `scripts/*/tests/probe-*.sh` exists and no probe script is declared in the phase plans/summaries. The phase's observable probes are the `window.__wegolite` e2e assertions, exercised by the full `verify` run.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DOCK-01 | 04-01, 04-02 | Corridor derived from the Coriolis dock geometry and matches the visible opening | ✓ SATISFIED | Measured `dock-port.json` (103.4123 × 241.888 × 250) with manifest/drift/golden; port-frame classifier; e2e independent pose docks through the opening. |
| DOCK-02 | 04-02 | Station spins at Oolite's rate; docking tolerates roll with x/y auto-centring | ✓ SATISFIED | `stationRollRadPerSec = 0.1256637…` (2π/50 s, Oolite's right-angles/s conversion); band correction tests; corridor invariance at four angles; computed 31.296° limit. |
| DOCK-03 | 04-03 | Off-axis contact produces scrape/bounce feedback with the v1 collision-only hull model | ✓ SATISFIED | 15-axis SAT, reflected-velocity bounce, scrape events, deterministic shake/flash, fixed copy; e2e observes all three channels. |
| DOCK-04 | 04-02 | Crossing 90% past the dock plane while aligned transitions cleanly to docked | ✓ SATISFIED | Weighted-plane capture test, exact mouth pose, transition matrix; e2e mode `docked`. |
| DOCK-05 | 04-04 | Docking computer can be bought (TL 9, 1500 Cr) and grants instant docking on Shift+C with +20 min | ✓ SATISFIED (reachability caveat) | `canPurchase`/`purchase` unit-proven at a synthetic TL 9; Lave correctly refuses; Shift+C +1200 unit/e2e. Lave is the only reachable system in this phase, so the buy flow is not browser-reachable yet (see Deferred). |
| DOCK-06 | 04-03 | A failed attempt never traps the player; recover to flight with clear feedback | ✓ SATISFIED | Seeded no-trap property (non-penetration, outward separation, retry), integrated chain, browser bounce/retry and skipped-launch negatives. |
| DOCK-07 | 04-05 | Autosave on launch so the docked state is always resumable | ✓ SATISFIED | Launch commit e2e restores the exact clock via Continue; strict v1 schema; future/unreadable/inaccessible blobs preserved; tainted profiles never written. |

No orphaned requirements: `.planning/REQUIREMENTS.md` maps only DOCK-01..07 to Phase 4, and every ID appears in plan frontmatter.

### Decision Coverage

`check.decision-coverage-verify` reports **15/15 trackable decisions honored**, `not_honored: []`:

> All trackable CONTEXT.md decisions are honored by shipped artifacts.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `tests/sim/dock-corridor.test.ts` | DOCK-01/02/04 | all | 0 | no | Value + behavioural boundaries | PASS |
| `tests/sim/dock-capture.test.ts` | DOCK-01/04 | all | 0 | no | Behavioural (pose/count/clock) | PASS |
| `tests/sim/dock-cadence.test.ts` | DOCK-02/04 | 1 | 0 | no | Behavioural (hash + counters) | PASS |
| `tests/sim/dock-hull.test.ts` | DOCK-03/06 | all | 0 | no | Value + behavioural | PASS |
| `tests/sim/dock-no-trap.test.ts` | DOCK-06 | all | 0 | no | Property + behavioural | PASS |
| `tests/sim/dock-integrated.test.ts` | DOCK-06 | 2 | 0 | no | Behavioural chain | PASS |
| `tests/sim/dock-computer.test.ts` | DOCK-05 | all | 0 | no | Value + behavioural | PASS |
| `tests/sim/dock-transitions.test.ts` | DOCK-05 | 4 | 0 | no | Behavioural matrix | PASS |
| `tests/sim/player-profile.test.ts` | DOCK-05 | all | 0 | no | Value boundaries | PASS |
| `tests/persistence/save.test.ts` | DOCK-07 | all | 0 | no | Value reject table + spy | PASS |
| `tests/persistence/autosave.test.ts` | DOCK-07 | all | 0 | no | Value + behavioural ordering | PASS |
| `tests/e2e/docking.spec.ts` | DOCK-01..06 | 6 | 0 | no | Behavioural browser | PASS |
| `tests/e2e/autosave.spec.ts` | DOCK-07 | 12 | 0 | no | Behavioural real-IDB | PASS |

**Disabled tests on requirements:** 0.
**Circular patterns detected:** 0 (the golden is a byte copy of the emitter, but the measured values are also independently pinned and derived from the vendored mesh; no test writes expected values by running the system under test).
**Insufficient assertions:** 2 WARNINGs — no committed assertion for orientation preservation after a bounce; no committed test for the disarmed tunnel-end clamp. Ad-hoc checks passed; the suite would not catch a regression. The manual-capture torus/impulse reset is also only covered indirectly through the computer-dock test (minor).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/content/schemas/dock-port.ts`, `src/sim/dock/geometry.ts` | `halfExtent` / `requirePositive` | No magnitude bound on `halfX`/`halfY`/corridor half-extents; `MIN_VALUE`/`MAX_VALUE` are accepted | ⚠️ WARNING (W-01) | Literal overreach of 04-01.5. The dangerous aperture/expansion inputs are bounded and tested; the committed record is 500/51.70615. A forged static record could carry a degenerate half-extent. Recommend a finite magnitude range before Phase 5. |
| `src/input/actions.ts:82`, `src/ui/controls.ts:191-195` | `ACTION_LABELS.dockingComputer` + Controls render | Label is "Docking computer (Shift+)" beside "C", so the screen never says Shift+C | ⚠️ WARNING (W-02) | DOCK-05 discoverability; binding works, copy is weak. |
| `index.html:108-113,287-289` | Docked panel | Reason `<dd>` has no `<dt>`, sits in the label column; disabled Buy looks active; Buy/Launch buttons touch | ⚠️ WARNING (W-03) | Visual/semantic quality of the DOCK-05 purchase surface; automation pins the strings/disabled state, not the layout. |
| `src/app/game-session.ts:450-466`, `:946-952`, `index.html:270-274` | New game clear | One click deletes the only save with no confirmation, undo or backup | ⚠️ WARNING (W-04) | Real data-loss hazard and UI-review blocker. Not a DOCK-07 functional failure (New game is an intentional clear), but fix before shipping. |
| `src/app/mode.ts`, `src/app/game-session.ts:151-156`, `src/app/game-session.ts:197` | Dead/stale surfaces | `advanceMode`/`screenForMode` unused; `onProfileChanged` seam not used for the purchase autosave; `apertureHalfExtents` is test-only | ℹ️ INFO | No functional impact; cleanup for Phase 5. |
| — | — | No `TBD`/`FIXME`/`XXX` in phase-changed source/tests/tools; no stub artefacts found | ✓ CLEAN | — |

### Human Verification Required

1. **Bounce feedback feel**

   **Test:** Launch, fly off-axis into the Coriolis, and observe the contact.
   **Expected:** Message, camera shake and red HUD frame are clearly visible; all clear within about 0.5 s; a second attempt is possible immediately.
   **Why human:** Amplitude/duration feel is qualitative; probes only prove presence and expiry.

2. **Docking-computer line, disabled state and Shift+C affordance**

   **Test:** Dock at Lave; inspect "Docking Computers — 1500.0 Cr (TL 9)", the disabled Buy control, the reason and the Controls screen.
   **Expected:** Reason "Requires TL 9" is legible in the value column, the disabled control is visually distinct, and Controls says Shift+C (not just "C").
   **Why human:** Layout, colour and discoverability are visual judgements. The UI review reports the current Controls label renders "C", the disabled Buy looks active, and the reason sits in the label column.

3. **New game save deletion decision**

   **Test:** With a committed save, click New game once.
   **Expected:** A confirmation/one-slot backup before deletion, or an explicit product decision that one-click deletion is intended.
   **Why human:** This is a product/UX decision. It is a UI-review blocker but not a DOCK-01..07 functional failure; the save is the only copy of progress in v1.

4. **Add a committed regression test for the disarmed tunnel-end clamp**

   **Test:** Place a disarmed in-flight ship with `box.min.z < -250`, call `stepDocking` once; assert the clamp to −250, no events, mode inFlight.
   **Expected:** Positional clamp only; no bounce/docked/scrape.
   **Why human:** No committed test; an ad-hoc Docker check passed on this tree.

5. **Add a committed regression test for orientation preservation through a bounce**

   **Test:** Capture the orientation, place a straddle or hull contact, call `stepDocking` once, deep-compare orientation.
   **Expected:** Exactly one bounce; orientation unchanged; mode inFlight.
   **Why human:** No committed assertion; an ad-hoc Docker check observed `unchanged: true`.

### Gaps Summary

No must-have truth failed; no artifact is missing or a stub; no key link is broken. The phase goal is achieved in the codebase and in the browser: measured corridor, weighted-plane capture, bounce/scrape feedback with no trap, TL-gated docking computer with exact +1200 s, and committed launch autosave with Continue restore all pass.

The two behaviour-unverified truths are coverage gaps, not observed product failures: the disarmed tunnel-end clamp and orientation preservation have no committed regression test. The schema's half-extent magnitude bound is a low-severity hardening gap against a static generated asset, not a goal blocker. The UI review's New game blocker is a real data-loss hazard, but it is an intentional New-game clear and does not violate DOCK-07's autosave/resume contract or the goal's docking-risk wording; it should be fixed as a UX follow-up. The remaining human items are visual feel, purchase-panel layout/discoverability and the save-deletion product decision.

## Observations (non-blocking)

- **Fix provenance:** `e687537` (floor the fractional autosave clock and fail closed on an invalid encoded blob) and `86b758b` (sniff a future version before the size cap and treat unknown shapes as untouchable) are ancestors of HEAD. Their behaviour is covered by `tests/persistence/autosave.test.ts`, `tests/persistence/save.test.ts` and the future/oversized real-IndexedDB e2e cases; all pass.
- **MVP-mode discrepancy:** ROADMAP says `Mode: mvp`; the goal is not a user story (`user-story.validate` false). Standard goal-backward verification used. Reformat with `/gsd-mvp-phase 04` if MVP UAT framing is required.
- **Security observations are stale:** `04-SECURITY.md` Observations 2 (non-string value could be cleared) and 3 (fractional clock not re-asserted by `encodeSave`) describe pre-fix behaviour. `86b758b` makes non-string/unreadable values untouchable, and `e687537` floors the clock and validates the encoded blob before writing. Both are closed, not open.
- **DOCK-05 reachability:** Lave's raw TL 4 correctly refuses the TL 9 computer; the unit pair proves the rule at a synthetic TL 9. The player-visible purchase path awaits a TL 9 system (Phase 6) or the Phase 5 outfitting screen.
- **Known flake:** the load-sensitive `tests/guards/content-boundary.test.ts` 5 s timeout did not occur in this full run; the file passed (its lint/typecheck subprocesses took about 68 s in total).
- **No new dependencies:** `package.json` is unchanged; `idb`/`fake-indexeddb` remain rejected.

---

_Verified: 2026-11-05T11:13:59Z_
_Verifier: the agent (gsd-verifier)_
