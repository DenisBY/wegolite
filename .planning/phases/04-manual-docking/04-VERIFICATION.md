---
phase: 04-manual-docking
verified: 2026-11-05T14:32:24Z
status: passed
score: 54/54 must-haves verified
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
  - .planning/phases/04-manual-docking/04-06-PLAN.md
  - .planning/phases/04-manual-docking/04-06-SUMMARY.md
  - .planning/phases/04-manual-docking/04-07-PLAN.md
  - .planning/phases/04-manual-docking/04-07-SUMMARY.md
  - .planning/phases/04-manual-docking/04-08-PLAN.md
  - .planning/phases/04-manual-docking/04-08-SUMMARY.md
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
  - src/input/bindings.ts
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
  - src/ui/controls.ts
  - src/ui/docked.ts
  - src/ui/title.ts
  - tests/app/dock-feedback.test.ts
  - tests/app/title-confirm.test.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/docking.spec.ts
  - tests/e2e/helpers/title.ts
  - tests/e2e/launch.spec.ts
  - tests/e2e/settings.spec.ts
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
covered_digest: "v4:sha256:8eb3265926dcdfe822d1749b4347ece7f5bab9140b040126244426238691084c"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 42/44
  gaps_closed:
    - "G-04-2 — the disabled Buy docking-computer control is visually distinct, the refusal sits in the value cell with aria-describedby, and Controls prints Shift+C"
    - "G-04-3 — New game asks for confirmation before deleting a committed save; Cancel/Escape preserve it byte-for-byte"
    - "G-04-4 — a committed sim test pins the disarmed tunnel-end clamp"
    - "G-04-5 — committed sim tests pin one-bounce and orientation invariance through straddle and hull contact"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "A player can buy the docking computer at a station whose tech level allows it"
    addressed_in: "Phase 5 (outfitting screen) / Phase 6 (hyperspace to TL 9 systems)"
    evidence: "Phase 5 ECON-05 reuses `canPurchase`; Phase 6 NAV opens systems beyond Lave. Lave is raw TL 4 and correctly refuses; the purchase rule and maths are unit-proven against a synthetic TL 9 record."
---

# Phase 4: Manual Docking Verification Report

**Phase Goal:** The player can dock a Cobra by hand with real feedback and real risk, and can buy a docking computer when they would rather not.
**Verified:** 2026-11-05T14:32:24Z
**Status:** passed
**Re-verification:** Yes — after UAT gap closure (04-06, 04-07, 04-08)

## MVP-Mode Note

ROADMAP.md marks this phase `Mode: mvp`, but the phase goal is not in the `As a …, I want …, so that …` form (`gsd-tools query user-story.validate` returns `valid: false`). Standard goal-backward verification was therefore used, as in the previous round. If MVP user-flow UAT framing is required, run `/gsd-mvp-phase 04` to reformat the goal first; this is a process discrepancy, not a product gap.

## Goal Achievement

The phase goal is achieved in the codebase and in the browser. The aperture and corridor are measured from the vendored Coriolis dock mesh and drift-checked; an aligned, correctly rolled approach docks on Oolite's weighted capture plane with the exact mouth pose; a sloppy approach bounces once, gives a message, camera shake and a red HUD frame, and recovers to flight immediately; the docking computer is TL-gated, costs the catalogue price and docks instantly on Shift+C for exactly +1200 s; and launching writes a committed IndexedDB autosave that Continue restores, with future/unreadable blobs left inert.

The previous round left four UAT gaps open. All four are closed on this tree and verified here:

- **G-04-2** — `index.html` now carries `#docked button:disabled` styling (dimmed border/text, reduced opacity, `not-allowed`, hover/focus scoped to `:not(:disabled)`), the refusal is a `span#dockcomp-message.docked-reason` inside the docking-computer value `dd`, `src/ui/docked.ts` sets `aria-describedby` when a reason exists, and `SHIFT_REQUIRED_ACTIONS` + `chordLabel` make Controls print `Shift+C` / rebind print `Shift+K`. `tests/e2e/docking.spec.ts#the docked panel shows real credits and refuses the TL 9 computer at Lave` asserts the computed style, hover non-fill, ARIA link, same-cell placement, positive button gap, Controls row and rebind status.
- **G-04-3** — `src/ui/title.ts` owns a static `role="alertdialog"` `#title-confirm`; `shouldConfirmNewGame` gates only `valid`/`corrupt`; `src/main.ts` enables it from the boot status; Cancel/Escape/Tab behave like `ui/pause.ts`; the accept path is the only caller of the stored start handler. `tests/app/title-confirm.test.ts` covers all six statuses, and `tests/e2e/autosave.spec.ts` proves the blob survives the first click and Cancel byte-for-byte and clears only after accept.
- **G-04-4** — `tests/sim/dock-corridor.test.ts#clamps a disarmed past-end ship along the port-frame k with no response` places a disarmed ship 50 m past the 250 m tunnel end at a rotated station, calls `stepDocking`, and asserts the port-frame clamp, no events, `inFlight`, still-disarmed latch and unchanged counters.
- **G-04-5** — `tests/sim/dock-hull.test.ts` now asserts, for both a straddle and a hull contact, exactly one `bounce` with its cause, a deep-equal pre-step orientation quaternion, `inFlight` and `bounceCount === 1`.

The full Docker gate was green on this tree: lint, Prettier, typecheck, `assets:check`, **697 unit/integration tests across 69 files**, production build, and **47 Playwright tests**.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 04-01.1 | The aperture (103.4123 × 241.888 × 250) is measured at build time from `third_party/oolite/Models/oolite_coriolis_dock.dat`, never typed into `src/sim/`. | ✓ VERIFIED | Generated JSON carries the three measured extents; the emitter reads the dock mesh; no literal under `src/sim`. |
| 04-01.2 | The emitter writes `src/content/generated/dock-port.json` at the repository-relative path, and the manifest carries that exact path. | ✓ VERIFIED | `DOCK_PORT_PATH`; manifest row with matching path/hash; unit test pins the row. |
| 04-01.3 | Corridor half-extents (ww 51.70615, hh 120.944) are derived at build time with a bounded expansion loop and byte-pinned in the golden. | ✓ VERIFIED | Generated and golden JSON agree; 64-step bounded loop with progress check; emitter test asserts byte equality. |
| 04-01.4 | The contact proxy covers the union of hull, tris and faceplate bounds, reaching station-local z −534.298 and +500; it is a box. | ✓ VERIFIED | `contact` is the union of the three station boxes; tests assert the bounds and that it is stated as a box. |
| 04-01.5 | Every emitted box has finite components, ordered axes and a positive span; zero, negative, NaN, Infinity, subnormal, reversed and degenerate input is rejected by the schema. | ✓ VERIFIED | Positive finite half-extents, `zMin < zMax`, ship `min < max`, port range `[1e-3, 1e5]`; reject table covers the listed inputs. Half-extent magnitude is still unbounded (W-01). |
| 04-01.6 | `assets:check` fails if the emitted `dock-port.json` drifts from the vendored `.dat`. | ✓ VERIFIED | `docker compose run --rm verify` reports `assets:check: no differences`; drift tests cover CHANGED/MISSING/hash. |
| 04-02.1 | A Cobra rolled to the slot and centred docks on the tick where `0.90*max.z + 0.10*min.z < 0`, with the docked pose equal to `dockMouthPosition(layout)`. | ✓ VERIFIED | `dock-capture.test.ts` asserts mode, count, deep-equal pose and exact event; `classifyCorridor` implements the weighted plane. |
| 04-02.2 | The corridor is the port-frame bounding box against the measured aperture, not a trigger sphere; the strict inequalities hold at stationAngle 0, π/4, π/2 and π. | ✓ VERIFIED | `dock-corridor.test.ts` asserts all four inequalities and lane outcome at the four phases. |
| 04-02.3 | Classification follows DockEntity.m:691-773: past-end reject, lane (no nose gate), then the 1.5× safety footprint under `box.min.z < 0`. | ✓ VERIFIED | `corridor.ts` order; boundary tests assert `min.z == 0 => outside`, `-1e-9 => band`, wings-across at 500 m => outside. |
| 04-02.4 | The emitted station-local contact box is converted to port coordinates once in `createDockGeometry` (z ≈ −1000.2561 … +34.0419). | ✓ VERIFIED | `geometry.ts` converts once; `dock-capture.test.ts` pins the bounds; `hull.ts` never re-projects. |
| 04-02.5 | After natural or skipped launch the ship arms once `box.min.z > contactPort.zMax`, and a later aligned return docks. | ✓ VERIFIED | Arming branch; natural and skipped-launch tests assert the threshold, no self-dock/scrape, and a later return docking once. |
| 04-02.6 | Roll acceptance is computed over the committed Cobra corners: 30° fits, 35° does not, limit ≈ 31.296°. | ✓ VERIFIED | Bisection derives the limit; the 30/35 pair and range are asserted. |
| 04-02.7 | Inside the 1.5× safety band with the nose past the plane, the ship shifts toward port centre each tick; roll tolerance comes only from the bbox. | ✓ VERIFIED | Band branch delta and one-scrape assertions; y-guard symmetry test. |
| 04-02.8 | Speed never gates docking: the same capture-plane pose docks at 0, `maxSpeed` and the torus cap. | ✓ VERIFIED | `dock-capture.test.ts#has no speed term…` asserts identical mode, pose, count and events. |
| 04-02.9 | Replay is hash-identical at 60/120/144 Hz and non-vacuous (`dockCount === 1`, `scrapeTicks > 0`). | ✓ VERIFIED | `dock-cadence.test.ts` asserts one hash across cadences and both counters. |
| 04-02.10 | While disarmed the ship cannot pass the 250 m tunnel end; the clamp is positional only and emits no bounce. | ✓ VERIFIED | `step.ts:150-157` clamps along `frame.k`; committed `dock-corridor.test.ts#clamps a disarmed past-end ship along the port-frame k with no response` asserts clamp, empty events, `inFlight` and latch false (G-04-4 closed). |
| 04-03.1 | An off-axis or rolled-wrong approach gives exactly one contact response per tick: reflected velocity with damping, orientation unchanged, mode inFlight; a nose-at-or-in-front tick gives no straddle/band/capture response. | ✓ VERIFIED | Exclusive pipeline, one-response count, mode and nose gate tested; committed straddle and hull tests now deep-compare the orientation quaternion and assert one bounce with cause (G-04-5 closed). |
| 04-03.2 | Contact detection is a 15-axis SAT of the ship OBB against the port-frame contact box, finding edge/face intersections with no corner inside. | ✓ VERIFIED | `hull.ts` fixed axis order, degenerate skip, earliest tie; edge-intersection test asserts contact + unit normal. |
| 04-03.3 | The proxy is the once-converted `contactPort`; a ship 200 m in front, outside the safety band, is not in contact. | ✓ VERIFIED | `hullContact` consumes snapshot + `contactPort`; the 200 m test asserts classifier `outside`, `hullContact === null`, `obbsIntersect === false`. |
| 04-03.4 | A launch followed by straight departure emits no contact response, natural or Space-skipped. | ✓ VERIFIED | `dock-hull`, `dock-integrated` and e2e skip path all assert `bounceCount === 0` through and past arming. |
| 04-03.5 | The integrated chain launch → clearance → off-axis bounce → retry → dock asserts one dock, one bounce, docked mode, and zero bounces through departure. | ✓ VERIFIED | `dock-integrated.test.ts#launches, departs cleanly…` asserts exactly those values. |
| 04-03.6 | Scrape, bounce, docked and dockDenied are sim events carrying their facts; copy, shake and flash live app-side. | ✓ VERIFIED | `events.ts` union; session maps events to fixed copy and `dock-feedback`; no UI copy in the sim. |
| 04-03.7 | Shake lasts 0.35 s and flash 0.40 s on the sim `flightTime`, are deterministic, and publish envelope strength. | ✓ VERIFIED | `dock-feedback.ts` constants; unit tests assert strength 1, linear expiry, determinism; e2e asserts presence and expiry. |
| 04-03.8 | The no-trap oracle asserts non-penetration, outward separation and retry-ability. | ✓ VERIFIED | Seeded fast-check property plus adversarial seeds; asserts `obbsIntersect` false after resolution and movement within 30 ticks. |
| 04-03.9 | A non-finite or absurd hook value is repaired at the start of `stepFlight`, and speed can never integrate position to Infinity. | ✓ VERIFIED | `sanitizeFlightState` at the top of `stepFlight`; `1e308`/NaN tests assert finite position and deterministic repair. |
| 04-03.10 | `scrapeTicks` increments exactly once per emitted scrape event. | ✓ VERIFIED | `dock-no-trap.test.ts` counts events and compares the counter. |
| 04-04.1 | `canPurchase` enforces raw `System.techLevelRaw`; Lave refuses the TL 9 computer and the panel says why. | ✓ VERIFIED | Raw-TL comparison; Lave-vs-synthetic-TL9 unit pair; browser asserts "Requires TL 9" and a disabled Buy. |
| 04-04.2 | The price is read from the validated catalogue by key; zero/negative/non-integer/non-finite prices are refused; no command price is trusted. | ✓ VERIFIED | `purchase`/`canPurchase` validate before arithmetic; reject tests; command is payload-free. |
| 04-04.3 | A new game has 1000 decicredits; 15000 succeeds leaving 0, 14999 is refused, owned is refused, credits never negative. | ✓ VERIFIED | `player-profile.test.ts` boundary pair, owned/double refusal, safe-integer bounds. |
| 04-04.4 | Shift+C inside the aegis with the computer docks on the same tick, adds exactly 1200 s, emits the computer event, and does not advance flightTime/stationAngle. | ✓ VERIFIED | `dock-computer.test.ts` and the four-row `dock-transitions.test.ts`; e2e asserts `lastClockDelta === 1200`. |
| 04-04.5 | Outside the aegis, without the computer, or when the mode at tick start is not inFlight, Shift+C emits dockDenied or nothing and changes neither mode nor clock. | ✓ VERIFIED | Each case covered in `dock-computer.test.ts`; browser covers the beyond-aegis message. |
| 04-04.6 | Commands are gated on `modeAtStart`, so a dock and a launch in one tick cannot both take effect. | ✓ VERIFIED | `stepFlight` gates launch/skipLaunch/dockingComputer; same-tick test asserts one transition and +1200 only. |
| 04-04.7 | Docking resets the torus drive and impulse, so a docked ship never carries residual motion. | ✓ VERIFIED | `dockWithComputer` resets both; test starts with engaged torus and speed 120; manual capture performs the same reset. |
| 04-04.8 | The keyboard emits a fresh command object per keydown; no shared `EDGE_COMMANDS` entry is mutated. | ✓ VERIFIED | `keyboard.ts` pushes `{ ...command }`; `bindings.test.ts` asserts distinct identity and chord behaviour. |
| 04-05.1 | Launching writes a versioned JSON autosave (docked mode, post-launch +600 s clock, credits, equipment, system, station key) to db `wegolite`, store `saves`, key `autosave`; a purchase writes the same shape. | ✓ VERIFIED | `store.ts` constants; `snapshotForSave` tests; real-IDB e2e asserts the committed launch clock; purchase snapshot test. |
| 04-05.2 | A future-version blob is never cleared or replaced; New game starts fresh without touching it, the launch write is skipped, and bytes are identical after both actions. | ✓ VERIFIED | `parseSave` returns future before schema; `canOverwrite`/`canClear` exclude future; e2e injects version 2 and asserts exact bytes. |
| 04-05.3 | A write is durable only on transaction `oncomplete`; operations are serialized; a monotonic revision makes stale completions no-ops. | ✓ VERIFIED | `idb-store.ts` resolves on `oncomplete`, rejects on abort/error; memory/e2e ordering; revision tests. |
| 04-05.4 | A tainted profile (any `?test=1` mutation) is never autosaved; the skip is observable in `probe.save`. | ✓ VERIFIED | Hook sets `testTainted`; `autosave()` skips with `skipReason: "tainted"`; e2e asserts zero writes/commits and null raw. |
| 04-05.5 | Oversized raw data is rejected before `JSON.parse`; boot never parses an unbounded string. | ✓ VERIFIED | `MAX_SAVE_CHARS` check precedes parse; parse-spy unit test; 1 MB e2e boots inert. |
| 04-05.6 | `parseSave` receives equipment, system and station allow-lists at the boot call site. | ✓ VERIFIED | `main.ts` builds all three; reject rows cover unknown keys. |
| 04-05.7 | `clockSeconds` is an integer inside a bounded safe range; 1e308 is rejected. | ✓ VERIFIED | Zod `.int().min().max()`; reject row for 1e308; `snapshotForSave` floors. |
| 04-05.8 | A `VersionError` on open never calls `deleteDatabase`; the store reports unavailable and the game runs without saves. | ✓ VERIFIED | `idb-store.ts` maps `VersionError` to `unavailable`; no `deleteDatabase` in `src`; refusal tests. |
| 04-05.9 | A corrupt blob is copied to `autosave.corrupt` by an explicit adapter operation, best effort, exactly on `corrupt`, and never read back. | ✓ VERIFIED | `main.ts` calls `backupCorrupt` only in the corrupt branch; bounded backup; e2e asserts backup/no-backup cases. |
| 04-05.10 | Docking does not autosave. | ✓ VERIFIED | e2e manual-dock case asserts attempts/writes stay 1; computer-dock case asserts attempts 1. |
| 04-06.1 | On the Docked screen the disabled Buy docking-computer control is visually distinct from Launch: dimmed border/text, reduced opacity, not-allowed cursor, no hover/focus fill. | ✓ VERIFIED | `index.html` `#docked button:disabled` + `:not(:disabled)` hover/focus; e2e asserts computed cursor/opacity/colour/border and unchanged background after hover. |
| 04-06.2 | The refusal reason renders inside the docking-computer value cell, adjacent to the control, is linked by `aria-describedby`, and a visible gap separates Buy from Launch. | ✓ VERIFIED | `span#dockcomp-message.docked-reason` inside the value `dd`; `src/ui/docked.ts` sets/removes `aria-describedby`; e2e asserts same-parent DD, attribute, and >4 px gap. |
| 04-06.3 | Controls shows "Docking computer" with "Shift+C", and a rebind status names the chord, sourced from shared action metadata. | ✓ VERIFIED | `SHIFT_REQUIRED_ACTIONS` in `actions.ts`; `chordLabel` in `bindings.ts`; `controls.ts` uses both; unit + e2e assert `Shift+C` and `Docking computer bound to Shift+K.` |
| 04-07.1 | With a committed valid save, the first New game click opens a confirmation and leaves the save untouched: blob readable, `probe.save.status` valid. | ✓ VERIFIED | `autosave.spec.ts` reads the raw blob before/after the first click and asserts byte identity and `status === "valid"`. |
| 04-07.2 | Cancel dismisses and preserves the save; accepting deletes it and starts a fresh docked game at Lave. | ✓ VERIFIED | Cancel path asserts hidden overlay + byte identity; accept path waits for `status === "absent"` and a visible docked panel. |
| 04-07.3 | With no clearable save at boot, New game starts immediately with no confirmation. | ✓ VERIFIED | `shouldConfirmNewGame` returns false for absent/future/unreadable/unavailable; the unit table covers all six statuses; e2e fresh-boot starter asserts `#title-confirm` hidden. |
| 04-07.4 | The gate is a title-layer static overlay (`alertdialog`/`aria-modal`); Escape closes it and returns focus, Tab is trapped, closing without accepting starts nothing, and main enables it only for valid/corrupt. | ✓ VERIFIED | Markup + `title.ts` focus trap/AbortController; `main.ts` calls `setNewGameConfirmationRequired(shouldConfirmNewGame(saveStatus))`; e2e asserts Escape focus restore, six-Tab containment, Cancel no-start. |
| 04-08.1 | A committed sim test places a disarmed past-end ship, calls `stepDocking`, and asserts the positional clamp, no events, inFlight mode and still-disarmed latch. | ✓ VERIFIED | `dock-corridor.test.ts#clamps a disarmed past-end ship along the port-frame k with no response`; passes in the targeted and full runs. |
| 04-08.2 | A committed sim test asserts a straddle contact emits exactly one bounce, leaves the quaternion deep-equal and keeps inFlight. | ✓ VERIFIED | `dock-hull.test.ts#emits exactly one straddle bounce and leaves the orientation deep-equal`; passes. |
| 04-08.3 | A committed sim test asserts the same one-bounce and orientation-invariance contract for a hull contact. | ✓ VERIFIED | `dock-hull.test.ts#emits exactly one hull bounce and leaves the orientation deep-equal`; passes. |

**Score:** 54/54 truths verified (0 present, behaviour-unverified).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | A player cannot buy the docking computer at Lave because Lave's raw TL is 4; the purchase path is unit-proven on a synthetic TL 9 system and the browser proves the refusal. | Phase 5 / Phase 6 | Phase 5 ECON-05 reuses `canPurchase`; Phase 6 NAV opens systems beyond Lave. This is faithful TL gating, not a broken purchase rule. |

### Advisory (New Scope, Unevidenced)

None — the re-verification round added only gap-closure work backed by committed tests and the recorded PROJECT.md decision.

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
| `src/sim/dock/step.ts` | `stepDocking` with arming and exclusive response | ✓ VERIFIED | Called by `stepFlight`; clamp and orientation now regression-tested. |
| `src/sim/flight/state.ts` | dockArmed/dockCount/scrapeTicks/impulse/bounceCount/repairCount | ✓ VERIFIED | Serialized and hashed; probe reads. |
| `tests/helpers/dock-pose.ts` | port-frame poses and computed roll limit | ✓ VERIFIED (test-only) | Used by the sim tests, integrated chain and 04-08 regressions. |
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
| `tests/e2e/autosave.spec.ts` | committed reload, future bytes, confirmation gate | ✓ VERIFIED (test-only) | 13 real-IndexedDB cases pass. |
| `index.html` | restructured purchase row, reason id, action group, `:disabled` rules, title alertdialog | ✓ VERIFIED | Styles and markup present; browser asserts computed style, ARIA and overlay semantics. |
| `src/ui/docked.ts` | conditional `aria-describedby` association | ✓ VERIFIED | Sets/removes the attribute with the reason. |
| `src/input/actions.ts` | `SHIFT_REQUIRED_ACTIONS` + clean docking label | ✓ VERIFIED | Consumed by keyboard and bindings; unit-tested. |
| `src/input/keyboard.ts` | shared shift set; private set removed | ✓ VERIFIED | Chord resolution reads `SHIFT_REQUIRED_ACTIONS`; no `REQUIRES_SHIFT`. |
| `src/input/bindings.ts` | `chordLabel` and shift-aware `labelFor` | ✓ VERIFIED | Used by Controls; unit-tested. |
| `src/ui/controls.ts` | chord-aware rebind status | ✓ VERIFIED | Uses `chordLabel`; e2e asserts `Shift+K`. |
| `src/ui/title.ts` | confirmation gate, focus handling, `shouldConfirmNewGame` | ✓ VERIFIED | Wired from `main.ts`; unit + browser tests. |
| `src/main.ts` | boot-status wiring of the confirmation requirement | ✓ VERIFIED | Calls `setNewGameConfirmationRequired(shouldConfirmNewGame(saveStatus))`. |
| `tests/app/title-confirm.test.ts` | status-to-gate predicate table | ✓ VERIFIED (test-only) | Six statuses, all pass. |
| `tests/e2e/helpers/title.ts` | shared New-game starter that accepts the prompt | ✓ VERIFIED (test-only) | Used by launch and settings specs. |
| `tests/sim/dock-corridor.test.ts` | disarmed tunnel-end clamp regression | ✓ VERIFIED (test-only) | Passes in the full run. |
| `tests/sim/dock-hull.test.ts` | straddle and hull orientation-preservation regressions | ✓ VERIFIED (test-only) | Passes in the full run. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `generateContent` | emitted `DOCK_PORT_PATH` | `emitted[]` + manifest | ✓ WIRED | Manifest row exists; `assets:check` scans it. |
| `loadDockPort()` | `createGameSession` | `start()` load | ✓ WIRED | Geometry built once and passed in. |
| `StepOptions.dock` | `stepDocking` | `stepFlight` every step | ✓ WIRED | Called after the station-angle update. |
| `dockSnapshot` | `classifyCorridor` / `hullContact` | shared snapshot | ✓ WIRED | One frame, same corners/centre/axes. |
| `SimEvent docked` | `handleEvent` | docked panel show + HUD hide | ✓ WIRED | Browser observes the panel. |
| Shift+C chord | `dockingComputer` command | `stepFlight` `modeAtStart` gate | ✓ WIRED | Unit + e2e. |
| `profile.equipment` | `StepOptions.equipment` | session each frame | ✓ WIRED | `hasComputer` derived from the set. |
| buy control | `canPurchase` → `purchase` → credits | session handler | ✓ WIRED | Re-checked in the click path; autosave after success. |
| `launched` event | `snapshotForSave` → `queueAutosave` | session `autosave()` | ✓ WIRED | Commit resolves the write; e2e reload. |
| boot read | `parseSave` → Continue | `main.ts` allow-lists | ✓ WIRED | Unknown keys rejected; title reads the status. |
| `testTainted` | autosave skip | `autosave()` guard | ✓ WIRED | Probe publishes `skipReason`. |
| `future`/`unreadable`/`unavailable` | clear/write skip | `canClear`/`canOverwrite` | ✓ WIRED | Future bytes are e2e byte-identical. |
| `SHIFT_REQUIRED_ACTIONS` | `bindings.chordLabel` → `labelFor` → Controls row | shared action metadata | ✓ WIRED | Unit + e2e assert `Shift+C`. |
| `setDockComputer(view.reason)` | `#dockcomp-message` in the value cell | `aria-describedby` on the Buy button | ✓ WIRED | Markup + `docked.ts` + e2e. |
| `#docked button:disabled` | computed style asserted by Playwright | native disabled remains the activation gate | ✓ WIRED | e2e computed-style/hover assertions. |
| boot `saveStatus` | `shouldConfirmNewGame` → `setNewGameConfirmationRequired` → click gate | title layer | ✓ WIRED | `main.ts` + unit table + e2e. |
| accept | `session.start()` → `clearSaveForNewGame()` → committed delete → `probe.save.status` absent | title accept handler | ✓ WIRED | e2e asserts the absent status after accept. |
| cancel or Escape | overlay hidden → focus returns to `#title-start` | title key/click handlers | ✓ WIRED | e2e asserts focus and no start. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `dock-port.json` → `stepDocking` | port/corridor/contact | Build-time `.dat` measurement | Yes — generated from the vendored mesh, drift-checked | ✓ FLOWING |
| `profile.credits` → docked panel | credits | Session `PlayerProfile` after launch/purchase | Yes — live balance, not a constant | ✓ FLOWING |
| `dockComputerView().reason` → `#dockcomp-message` | refusal reason | `canPurchase` against the loaded `System.techLevelRaw` and catalogue price | Yes — Lave yields "Requires TL 9"; the value is derived, not a static DOM default | ✓ FLOWING |
| `docked` event → docked panel | docked view | Sim event on capture/computer dock | Yes — panel shown and refreshed | ✓ FLOWING |
| `launched` → IndexedDB | save blob | Post-`beginLaunch` state/profile | Yes — real IDB commit, reload restores clock | ✓ FLOWING |
| boot `saveStatus` → confirmation overlay | required/absent | `store.read` + `parseSave` result | Yes — valid/corrupt prompt; the e2e proves no prompt on a fresh boot and a prompt after reload | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full phase gate | `docker compose run --rm verify` | lint + Prettier, typecheck, `assets:check: no differences`, 697 tests/69 files, build, 47 Playwright tests — exit 0 | ✓ PASS |
| Disarmed tunnel-end clamp regression | `docker compose run --rm test npx vitest run tests/sim/dock-corridor.test.ts` | 17 tests pass (includes the new clamp case) | ✓ PASS |
| Bounce orientation regression | `docker compose run --rm test npx vitest run tests/sim/dock-hull.test.ts` | 11 tests pass (includes straddle + hull orientation cases) | ✓ PASS |
| Confirmation predicate | `docker compose run --rm test npx vitest run tests/app/title-confirm.test.ts tests/input/bindings.test.ts` | 31 tests pass (7 + 24) | ✓ PASS |
| Browser disabled purchase + chord | `docker compose run --rm e2e` (within verify) | `the docked panel shows real credits and refuses the TL 9 computer at Lave` passes | ✓ PASS |
| Browser New-game confirmation | `docker compose run --rm e2e` (within verify) | `the New-game confirmation traps focus, Escape returns to New game, and the save survives` and `New game clears a committed save before starting` pass | ✓ PASS |

### Probe Execution

N/A — no `scripts/*/tests/probe-*.sh` exists and no probe script is declared in the phase plans/summaries. The phase's observable probes are the `window.__wegolite` e2e assertions, exercised by the full `verify` run.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DOCK-01 | 04-01, 04-02 | Corridor derived from the Coriolis dock geometry and matches the visible opening | ✓ SATISFIED | Measured `dock-port.json` (103.4123 × 241.888 × 250) with manifest/drift/golden; port-frame classifier; e2e independently derived pose docks through the opening. |
| DOCK-02 | 04-02 | Station spins at Oolite's rate; docking tolerates roll with x/y auto-centring | ✓ SATISFIED | `stationRollRadPerSec = 0.1256637…` (2π/50 s); band correction tests; corridor invariance at four angles; computed 31.296° limit. |
| DOCK-03 | 04-03, 04-08 | Off-axis contact produces scrape/bounce feedback with the v1 collision-only hull model | ✓ SATISFIED | 15-axis SAT, reflected-velocity bounce, scrape events, deterministic shake/flash, fixed copy; e2e observes all three channels; committed orientation-invariance tests. |
| DOCK-04 | 04-02 | Crossing 90% past the dock plane while aligned transitions cleanly to docked | ✓ SATISFIED | Weighted-plane capture test, exact mouth pose, transition matrix; e2e mode `docked`. |
| DOCK-05 | 04-04, 04-06 | Docking computer can be bought (TL 9, 1500 Cr) and grants instant docking on Shift+C with +20 min | ✓ SATISFIED (reachability caveat) | `canPurchase`/`purchase` unit-proven at a synthetic TL 9; Lave correctly refuses; Shift+C +1200 unit/e2e; disabled control + reason + `Shift+C` Controls copy browser-proven. Lave is the only reachable system in this phase (see Deferred). |
| DOCK-06 | 04-03, 04-08 | A failed attempt never traps the player; recover to flight with clear feedback | ✓ SATISFIED | Seeded no-trap property (non-penetration, outward separation, retry), integrated chain, browser bounce/retry and skipped-launch negatives; committed clamp and one-bounce regressions. |
| DOCK-07 | 04-05, 04-07 | Autosave on launch so the docked state is always resumable | ✓ SATISFIED | Launch commit e2e restores the exact clock via Continue; strict v1 schema; future/unreadable/inaccessible blobs preserved; tainted profiles never written; New game now confirms before clearing. |

No orphaned requirements: `.planning/REQUIREMENTS.md` maps only DOCK-01..07 to Phase 4, and every ID appears in plan frontmatter (04-01 DOCK-01; 04-02 DOCK-01/02/04; 04-03 DOCK-03/06; 04-04 DOCK-05; 04-05 DOCK-07; 04-06 DOCK-05; 04-07 DOCK-07; 04-08 DOCK-03/06).

### Decision Coverage

`check.decision-coverage-verify` reported **15/15 trackable decisions honored** in the previous round. The only new decision — "Ask before New game deletes a committed save (refines D-14)" — is recorded in `.planning/PROJECT.md:103` and proven by the new unit/e2e tests.

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `tests/sim/dock-corridor.test.ts` | DOCK-01/02/04 | all | 0 | no | Value + behavioural boundaries + clamp | PASS |
| `tests/sim/dock-capture.test.ts` | DOCK-01/04 | all | 0 | no | Behavioural (pose/count/clock) | PASS |
| `tests/sim/dock-cadence.test.ts` | DOCK-02/04 | all | 0 | no | Behavioural (hash + counters) | PASS |
| `tests/sim/dock-hull.test.ts` | DOCK-03/06 | all | 0 | no | Value + behavioural + quaternion invariance | PASS |
| `tests/sim/dock-no-trap.test.ts` | DOCK-06 | all | 0 | no | Property + behavioural | PASS |
| `tests/sim/dock-integrated.test.ts` | DOCK-06 | all | 0 | no | Behavioural chain | PASS |
| `tests/sim/dock-computer.test.ts` | DOCK-05 | all | 0 | no | Value + behavioural | PASS |
| `tests/sim/dock-transitions.test.ts` | DOCK-05 | all | 0 | no | Behavioural matrix | PASS |
| `tests/sim/player-profile.test.ts` | DOCK-05 | all | 0 | no | Value boundaries | PASS |
| `tests/persistence/save.test.ts` | DOCK-07 | all | 0 | no | Value reject table + spy | PASS |
| `tests/persistence/autosave.test.ts` | DOCK-07 | all | 0 | no | Value + behavioural ordering | PASS |
| `tests/app/title-confirm.test.ts` | DOCK-07 | all | 0 | no | Policy table (6 statuses) | PASS |
| `tests/input/bindings.test.ts` | DOCK-05 | all | 0 | no | Chord formatting + identity | PASS |
| `tests/e2e/docking.spec.ts` | DOCK-01..06 | all | 0 | no | Behavioural browser + computed style/ARIA | PASS |
| `tests/e2e/autosave.spec.ts` | DOCK-07 | all | 0 | no | Behavioural real-IDB + confirmation gate | PASS |

**Disabled tests on requirements:** 0.
**Circular patterns detected:** 0 (the golden is a byte copy of the emitter, but the measured values are independently pinned and derived from the vendored mesh; no test writes expected values by running the system under test).
**Insufficient assertions:** none remaining — the two previous coverage WARNINGs are closed by committed regressions, and the disabled-control contract is now asserted at computed-style/ARIA level.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/content/schemas/dock-port.ts`, `src/sim/dock/geometry.ts` | `halfExtent` / `requirePositive` | No magnitude bound on `halfX`/`halfY`/corridor half-extents; `MIN_VALUE`/`MAX_VALUE` are accepted | ⚠️ WARNING (W-01) | Literal overreach of 04-01.5. The dangerous aperture/expansion inputs are bounded and tested; the committed record is 500/51.70615. A forged static record could carry a degenerate half-extent. Recommend a finite magnitude range before Phase 5. |
| — | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` in phase-changed source/tests/tools; no stub artefacts found | ✓ CLEAN | — |

The previous W-02 (Controls never says Shift+C), W-03 (reason in the label column / disabled Buy looks active) and W-04 (one-click save deletion) are all resolved by 04-06 and 04-07 and are now asserted automatically.

### Human Verification Required

None. The previous round's five human items are resolved:

- Bounce feedback feel was human-verified (UAT test 1, `pass`).
- The docking-computer panel complaints are now covered by computed-style, ARIA and layout assertions in the browser.
- The New-game deletion decision is now a product decision recorded in `PROJECT.md` and enforced by a confirmation dialog.
- The two regression-coverage gaps are closed by committed sim tests.

### Gaps Summary

No must-have truth failed; no artifact is missing or a stub; no key link is broken; no unresolved debt marker. The phase goal is achieved in the codebase and in the browser: measured corridor, weighted-plane capture, bounce/scrape feedback with no trap, TL-gated docking computer with exact +1200 s, and committed launch autosave with Continue restore all pass. The four UAT gaps from the previous round are closed with verified code and committed tests. The only outstanding item is the deliberate DOCK-05 reachability limitation (Lave is raw TL 4), which is deferred to Phase 5/6.

## Observations (non-blocking)

- **MVP-mode discrepancy:** ROADMAP says `Mode: mvp`; the goal is not a user story (`user-story.validate` false). Standard goal-backward verification used, as in the previous round. Reformat with `/gsd-mvp-phase 04` if MVP UAT framing is required.
- **Test count growth:** 697 unit tests across 69 files (up from 686/68) and 47 Playwright tests (up from 46), matching the four gap-closure plans.
- **Coverage-only plan:** 04-08 modified only test files; `src/sim/dock/step.ts` was not touched, so the clamp and orientation behaviour verified here is the same code previously observed ad hoc — now regression-pinned.
- **No new dependencies:** `package.json` is unchanged; `idb`/`fake-indexeddb` remain rejected.

---

_Verified: 2026-11-05T14:32:24Z_
_Verifier: the agent (gsd-verifier)_
