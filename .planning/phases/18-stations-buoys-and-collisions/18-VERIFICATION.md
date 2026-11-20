---
phase: 18-stations-buoys-and-collisions
verified: 2026-11-20T17:58:00Z
status: passed
score: 5/5 roadmap success criteria verified (plan must-haves of 18-01..18-22 spot-checked against code and tests, none failed)
covered_files: [".planning/phases/18-stations-buoys-and-collisions/18-01-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-01-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-02-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-02-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-03-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-03-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-04-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-04-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-05-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-05-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-06-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-06-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-07-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-07-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-08-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-08-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-09-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-09-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-10-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-10-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-11-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-11-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-12-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-12-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-13-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-13-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-14-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-14-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-15-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-15-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-16-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-16-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-17-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-17-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-18-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-18-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-19-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-19-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-20-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-20-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-21-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-21-SUMMARY.md",".planning/phases/18-stations-buoys-and-collisions/18-22-PLAN.md",".planning/phases/18-stations-buoys-and-collisions/18-22-SUMMARY.md","src/app/hud-model.ts","src/app/session/context.ts","src/app/session/event-router.ts","src/app/session/hyperspace-controller.ts","src/app/session/probe-publisher.ts","src/app/session/render-driver.ts","src/app/session/start-session.ts","src/app/session/step-options.ts","src/app/session/traffic.ts","src/content/generated/manifest.json","src/content/generated/ships-static-hulls.json","src/content/schemas/ship-hull.ts","src/content/schemas/ship-static-hull.ts","src/content/ships-static-hulls.ts","src/render/bodies/buoy.ts","src/render/hud/format.ts","src/render/sync.ts","src/sim/combat/collide.ts","src/sim/combat/constants.ts","src/sim/combat/hit.ts","src/sim/combat/ident.ts","src/sim/combat/ledger.ts","src/sim/combat/octree.ts","src/sim/combat/response.ts","src/sim/combat/shields.ts","src/sim/combat/step.ts","src/sim/dock/computer.ts","src/sim/dock/step.ts","src/sim/flight/config.ts","src/sim/flight/drift.ts","src/sim/flight/launch.ts","src/sim/flight/sanitize.ts","src/sim/flight/state.ts","src/sim/flight/step.ts","src/sim/hyperspace/arrival.ts","src/sim/hyperspace/countdown.ts","src/sim/npc/collision-chain.ts","src/sim/npc/flight.ts","src/sim/npc/proximity.ts","src/sim/sim.ts","src/sim/world/aegis.ts","src/sim/world/debris.ts","src/sim/world/drift.ts","src/sim/world/entity.ts","src/sim/world/ids.ts","src/sim/world/kill.ts","src/sim/world/limits.ts","src/sim/world/sanitize.ts","src/sim/world/serialize.ts","src/sim/world/ship-field.ts","src/sim/world/snapshot.ts","src/sim/world/sorted-lists.ts","src/sim/world/statics.ts","src/sim/world/step.ts","src/sim/world/view-impl.ts","src/sim/world/world.ts","tests/e2e/combat.spec.ts","tests/e2e/hyperspace-failure.spec.ts","tests/e2e/statics.spec.ts","tools/oolite-ingest/convert/static-hulls.ts","tools/oolite-ingest/generate.ts"]
covered_digest: "v4:sha256:bb1c3cfc90c71d338ac33b23bfe358ce6fec4e1b9d5f42d76451c9955ee023d8"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Complete a witchspace jump within about 264 m of the witchpoint beacon (traffic on) and read the refusal line on the HUD"
    expected: "'Witchspace jump aborted: too close to Witchpoint Beacon' is drawn in full inside the message rows (no clipping); the 60-character budget the owner set holds visually"
    why_human: "No spec measures the drawn width of the message rows; hud.spec.ts reads only the probe text (18-07-SUMMARY lines 261-264)"
  - test: "In a traffic-on session, shoot the nav buoy's frangible subentity until it detaches, then destroy the buoy"
    expected: "On detachment the core mesh disappears while the hull and flashers stay; on destruction the whole buoy disappears from the 3D view (the scanner half is automated by statics.spec.ts)"
    why_human: "Visibility flags are unit-tested (tests/render/buoy.test.ts, render-driver.test.ts), but no browser spec looks at the rendered buoy; 18-08-SUMMARY records the visual as not automated"
  - test: "Owner reads the Phase 18 divergence list and the open owner questions in 18-12-SUMMARY.md (Owner questions 1-5, 7)"
    expected: "Each recorded divergence (E-131 1 m/s push, E-133 station not pushed, E-135 subentity contact once and station not a collider, E-138 drift edges, E-147 launching player not pushed, E-150 burnt-out wreck, E-151 drift pass, E-152 negative scrape, E-153 octree composition, D-08 pods/plates never block, E-126 compass cycle) is accepted or turned into a todo; the CONTEXT PD-02 figures, the collisions-on seeds question and the traffic-off raw ident key are decided"
    why_human: "Acceptability of a recorded divergence and the open questions are owner decisions, not test outcomes (18-12 coverage D5, human_judgment: true)"
---

# Phase 18: Stations, Buoys and Collisions Verification Report

**Phase Goal:** The Coriolis station and the navigation buoys become real targets and obstacles: lasers and ident hit them, buoys hold damage and can be destroyed, and ships that touch each other or a buoy damage both by Oolite's mass and closing-speed rule, while contact with the station hull stays damage-free
**Verified:** 2026-11-20T17:58:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

All automated evidence is green. Three items remain for a human: two on-screen visuals and the owner's reading of the recorded divergences. Every truth was checked against the source, and the behaviour-dependent ones against named tests run in Docker by this verifier.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The Coriolis octree is measured against the hull caps and the result is a Key Decision. Hulls for the Coriolis, the buoy, the barrel and the plate come from Oolite octrees, with provenance, a strict schema, a digest golden and the drift gate. | VERIFIED | `src/content/generated/ships-static-hulls.json` holds 4 hulls in order: coriolis-station (r 779.3702392578125, frangible false, subentities faceplate/tris at (0,0,0) and dock at (0,0,500.2561)), buoy (r 59.13554763793945, frangible true, subentity mass 7646.7861328125), barrel, alloy. It also holds 5 names. Strict bounded schema: `src/content/schemas/ship-static-hull.ts` (per-octree 40,000, artifact 104,000, file 270,000 bytes). Golden: `tests/golden/content/ships-static-hulls.json`. Key Decision: PROJECT.md:328 records the 32,841-node measurement and the separate lazy file. Provenance: NOTICE:102-139 and ASSETS.md:60-67. `static-hulls.test.ts` passes "is deterministic and equals the committed generated file"; `ships-static-hulls.test.ts` 25/25 passes. |
| 2 | A laser stops at what it hits. The station absorbs and is never destroyed. A buoy takes 250 of damage and, at zero, is destroyed and leaves the 3D view and the scanner. Station subentities follow Oolite's rule, proven at the dock mouth by independent fixtures. | VERIFIED | `hit.ts:183-202` ports the subentity rule (strict tie keeps the hull). In `step.ts:489-516` the statics are candidates first, and a destroyed buoy is skipped. In `ledger.ts`, a station record emits only `shipHit` (no write, never lethal), a buoy writes `staticHealth`, and lethal goes to `destroyBuoy`. Tests passed (Docker): step.test.ts "a shot at a ship behind the station ends on the station's back face; the ship takes nothing", "a pulse ... leaves it at 235", "17 hull hits destroy it once", "a destroyed buoy stays 0 through 10,000 stepped ticks; the station is never written"; dock-mouth.oracle.test.ts 21/21; render-driver.test.ts "hides a destroyed nav buoy ... plots both so" (scanner contacts exclude it); hud-model.ts:131-138 skips destroyed buoys. Browser: statics.spec.ts "the player's lasers destroy the nav buoy and it leaves the scanner" passed inside remote verify-full at 5b3cc96 (src unchanged since). |
| 3 | Ident locks the station and the buoys and shows their names. The lock ends when a buoy is destroyed. The lasers/ident todo is closed. | VERIFIED | ident.test.ts 36/36 passed, including "locks the main station 3,000 m ahead", "locks the nav buoy as buoy and the witchpoint buoy as buoy-witchpoint", "a locked nav buoy destroyed by a real shot emits identLost after shipDestroyed on that tick", "never acquires a destroyed buoy". Names: event-router.ts `identName` with `ctx.core.targetNames` built from the artifact's names (start-session.ts:547); event-router-ident.test.ts "prints the compiled station name with traffic on". statics.spec.ts "ident locks the Coriolis station in a traffic-on session" ran remotely. The todo is in `.planning/todos/completed/2026-11-15-lasers-and-ident-hit-stations-and-buoys.md`. |
| 4 | Ship-ship and ship-buoy contacts (the player included), octree against octree, damage both by mass and closing speed, once per contact. Separating pairs are ignored. A collision kill goes through the kill path with debris. The station hull stays damage-free, docking is unchanged, and no arrival or launch pose overlaps a buoy hull. | VERIFIED | `collide.ts` `resolveCollisions`: colliders are the in-flight player (never launching), live ships, pods and plates, and live buoys. The station is never a collider. Broad sweep, then `doOctreesCollide`, then `collideWithShip` (`response.ts`, the right half; response.oracle 37/37). `runContactCalls` resolves each contact once. Damage is queued as `scrape` records after the laser records. The app opts in with `collisions: true` (step-options.ts:129). Tests passed: collision-stage.test.ts "damages each side once ... and never again over 600 idle ticks", "a Krait rammed to zero is destroyed through killShip with its debris", "the station is never a collider", "a manual dock at zero drift is byte-identical with collisions on and off", "a 68 m/s drift into the hull bounces once, then docks"; collision-buoy.test.ts 9/9 (player rams nav buoy, the buoy moves, detached-subentity mass); buoy-clearance.test.ts 5/5 (2,048 layouts). |
| 5 | Worlds that never fire, ident or collide hash as before. A collision scenario hashes equal at 30, 60 and 144 Hz. | VERIFIED | Pristine-omit for drift, buoys and staticHealth. collision-stage.test.ts "a tick that never collides changes no hashed state (criterion 5)" and "without the opt-in ... the hashes equal collisions: false". collision-cadence.test.ts "collisions across frame rates (criterion 5)" (CADENCES [30, 60, 144]). world-cadence, npc-cadence, debris-cadence, tick-parity and sim-driver all pass. `tests/acceptance` is unchanged since 76229f5. QUAL-11 is 21/21 at 5b3cc96. The pin moves were owner-approved (see below). |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Owner-decided changes to plan must-haves (noted, not gaps)

- The twin hash `TWIN_HASH_60_AFTER_KILL` in `tests/e2e/combat.spec.ts` was re-pinned in 18-05 and 18-06, with an owner decision dated 2026-11-20 and cited in the spec comment. Plan 18-04's text said "combat.spec.ts passes unedited". The owner-decided version supersedes it.
- The HUD message budget went to 55 and then to 60 characters (`9bd9f6a`), against 18-07's "at most 54 characters".
- 18-21 made setup-only edits in five NPC tests. PD-08's prefilter applies to buoy pairs only; the all-pairs version is a todo with the guard `collision-chain-scope.test.ts`.
- The octree prime uses Oolite's z order (`eb97849`, after a re-measurement on real Oolite) instead of 18-11's "lower rank is prime". FIDELITY E-135 and the PROJECT.md row were corrected in 18-12.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/content/generated/ships-static-hulls.json` | 4 static hulls + names | VERIFIED | 205,542 bytes. Listed in manifest.json; loaded only on the traffic branch (start-session.ts:292) |
| `src/content/schemas/ship-static-hull.ts`, `src/content/ships-static-hulls.ts` | strict schema, shared-promise loader | VERIFIED | Bounds as above; `loadStaticHulls` |
| `tools/oolite-ingest/convert/static-hulls.ts` | build from vendored octrees | VERIFIED | Its deterministic-emit test equals the committed file |
| `src/sim/combat/hit.ts` | subentity hit rule | VERIFIED | Wired from step.ts:548 |
| `src/sim/combat/ledger.ts` | station absorb, buoy health, subentity energy | VERIFIED | Wired from step.ts:786 |
| `src/sim/combat/ident.ts` | static and debris lock, lost on destroy | VERIFIED | `updateIdentTarget` runs after the kills (step.ts:823-824) |
| `src/sim/combat/collide.ts`, `response.ts` | octree contact + collideWithShip | VERIFIED | Wired from step.ts:767-777 behind `collisions === true` |
| `src/sim/world/statics.ts`, `kill.ts` (`destroyBuoy`), `drift.ts`, `debris.ts` (blast) | buoy pose, destruction, drift, blast | VERIFIED | All reached from `resolveShots` / `stepWorld` |
| `src/sim/flight/drift.ts` | player drift + braking | VERIFIED | flight-drift 32/32, player-braking oracle passes |
| `src/sim/hyperspace/countdown.ts`, `world/ship-field.ts` | live buoy blocks the jump | VERIFIED | hyperspace-blockage.test.ts 17/17 |
| `src/sim/npc/proximity.ts`, `collision-chain.ts` | buoys in proximity pass, prefilter | VERIFIED | buoy-proximity 21/21 |
| `src/app/hud-model.ts`, `src/render/sync.ts`, `src/render/bodies/buoy.ts` | destroyed buoy hidden/unplotted, moved buoy drawn | VERIFIED | render-driver 43/43, buoy 30/30 |
| `tests/oracles/combat/geometry/**`, `tests/oracles/combat/response/**` | independent oracles | VERIFIED | Self, anchor and oracle tests pass; oracle-independence guard passes |
| `tests/e2e/statics.spec.ts` | traffic-on browser spec | VERIFIED (remote) | Passed in verify-full at 5b3cc96 (18-12-SUMMARY D4) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| start-session.ts | ships-static-hulls loader | traffic-gated Promise.all, merged `hullTable(hullCatalogue, staticArtifact?.hulls)` | WIRED | start-session.ts:292, 305-310 |
| step-options.ts | CombatOptions | `collisions: true`, `hulls` | WIRED | step-options.ts:129-130 |
| step.ts `resolveShotHits` | statics.ts `STATIC_TARGETS`/`staticPose` | candidates first, ascending id | WIRED | step.ts:489-516 |
| step.ts `resolveShots` | collide.ts `resolveCollisions` | records appended after the laser records | WIRED | step.ts:767-777 |
| step.ts | kill.ts `destroyBuoy` / `killShip` | lethal list from `applyLedger` | WIRED | step.ts:811-818 |
| event-router.ts | static names | `ctx.core.targetNames` | WIRED | start-session.ts:547, event-router.ts:437 |
| hud-model.ts / render sync | world buoy state | `buoys.<key>.destroyed`/position | WIRED | hud-model.ts:96-138, sync.ts:152-171 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| HUD scanner contacts | buoy position / destroyed | `World.staticHealth`, `World.buoys` through `buoyPosition` | yes (render-driver test mutates the world and sees the frame change) | FLOWING |
| Ident message | `name` | compiled `names` from the static artifact | yes with traffic on; raw key with traffic off (recorded, todo `2026-11-20-ident-hud-raw-static-key-traffic-off`) | FLOWING |
| Hit table | `combat.hulls` | merged loaded artifact | yes | FLOWING |

### Behavioral Spot-Checks (run by this verifier, Docker)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Laser, ledger, ident, statics, collisions, cadence, oracles, clearance, guards (batch 1) | `docker compose run --rm test npx vitest run <22 files>` | 22 files, 455 tests passed | PASS |
| Oracles, braking, drift, blockage, session/app twins, render, cadence pins, guards, fidelity (batch 2) | `docker compose run --rm test npx vitest run <40 files>` | 40 files, 759 passed, 1 skipped (FIDELITY verbatim excerpt check needs `OOLITE_SRC`; run with it in 18-12, 9/9) | PASS |
| `src/` unchanged since the remote verify-full snapshot | `git diff --stat 5b3cc96 HEAD -- src tools index.html` | empty (only 4 test files changed, from the Nyquist audit) | PASS |
| Acceptance harness untouched | `git diff --quiet 76229f5 HEAD -- tests/acceptance` | exit 0 | PASS |

### Probe Execution

No phase-declared `probe-*.sh` and no `scripts/*/tests/probe-*.sh` exist. Step 7c: not applicable. PD-03's real-Oolite measurements (18-20) are recorded evidence: 15 SAME, 1 KNOWN, no MISMATCH, no INCONCLUSIVE. The mismatch todo does not exist.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-15 | 18-01, 18-12, 18-13, 18-22 | Hulls for the Coriolis (with subentities), buoy, barrel and plate from Oolite octrees; Coriolis size measured; separate file | SATISFIED | Truth 1 |
| CBT-17 | 18-02, 18-04..18-08, 18-12, 18-14, 18-15, 18-20, 18-22 | Lasers and ident hit the station and buoys; the station absorbs; buoys (250) destroyable; subentities as Oolite | SATISFIED | Truths 2, 3 |
| CBT-18 | 18-02, 18-03, 18-09..18-12, 18-14, 18-16..18-21 | Ship-ship and ship-buoy collisions by Oolite's mass and closing-speed rule; station contact damage-free | SATISFIED | Truths 4, 5 |

No orphaned requirements: REQUIREMENTS.md maps only DATA-15, CBT-17 and CBT-18 to Phase 18.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (all phase-modified src/tools/tests .ts files) | - | TBD/FIXME/XXX, TODO/HACK/placeholder | none found | - |
| `tests/oracles/combat/response/reference.ts` | 538 | REVIEW WR-01: blast unit vector single-rounded vs Oolite's double rounding (7.8e-8 relative) | Warning | Under the 1e-6 fixture tolerance; open in 18-REVIEW-DISPOSITION |
| `tests/oracles/combat/response/*` | - | REVIEW WR-02: fixtures generated from the reference, few hand anchors | Warning | Partly mitigated by `response.anchors.test.ts` (Nyquist audit, 7 anchors); open |
| `src/sim/combat/collide.ts` | 746-817 | REVIEW IN-01: buoy-subentity contact branch unreachable with the shipped hulls (sampled) | Info | Dead branch, no goal impact |

The 15 Info findings of 18-REVIEW are recorded with disposition `open`. None blocks the goal.

### Human Verification Required

### 1. Beacon refusal line on screen

**Test:** With traffic on, complete a jump within about 264 m of the witchpoint beacon.
**Expected:** "Witchspace jump aborted: too close to Witchpoint Beacon" is drawn in full in the message rows.
**Why human:** No spec measures the drawn width; the probe text alone is checked.

### 2. Destroyed buoy and detached core in the 3D view

**Test:** Shoot the nav buoy's subentity until it detaches, then destroy the buoy.
**Expected:** The core mesh vanishes and the hull and flashers stay. Then the whole buoy vanishes from the view.
**Why human:** The visibility flags are unit-tested, but no browser spec looks at the rendered buoy.

### 3. Owner reading of the divergences and open questions

**Test:** Read 18-12-SUMMARY.md "Owner questions (open)" and the FIDELITY rows it lists.
**Expected:** Each divergence is accepted or becomes a todo. The CONTEXT PD-02 figures, the collisions-on seeds question and the traffic-off raw ident key are decided.
**Why human:** These are owner decisions, not test outcomes.

### Gaps Summary

No gaps. All five roadmap success criteria and all three requirement IDs are backed by code that is present, substantive and wired, and by passing tests this verifier ran in Docker. The browser half (statics.spec.ts) and the release gate are backed by the remote verify-full at 5b3cc96, and `src/` has not changed since. The two review warnings concern oracle-side float rounding and fixture provenance. Both are within tolerance today and recorded as open. Status is `human_needed` only because of the two on-screen visuals and the owner's reading of the recorded divergences.

---

_Verified: 2026-11-20T17:58:00Z_
_Verifier: Claude (gsd-verifier)_
