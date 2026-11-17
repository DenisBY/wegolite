---
phase: 16-wreckage-cargo-and-the-entity-cap
verified: 2026-11-17T02:05:00Z
status: human_needed
score: 4/4 must-haves verified
covered_files:
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-01-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-01-SUMMARY.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-02-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-02-SUMMARY.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-03-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-03-SUMMARY.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-04-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-04-SUMMARY.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-05-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-05-SUMMARY.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-06-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-06-SUMMARY.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-07-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-07-SUMMARY.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-08-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-08-SUMMARY.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-09-PLAN.md"
  - ".planning/phases/16-wreckage-cargo-and-the-entity-cap/16-09-SUMMARY.md"
  - "scripts/vendor-oolite.sh"
  - "src/app/session/event-router.ts"
  - "src/app/session/render-driver.ts"
  - "src/app/session/traffic.ts"
  - "src/render/bodies/debris.ts"
  - "src/render/bodies/explosions.ts"
  - "src/sim/world/contacts.ts"
  - "src/sim/world/debris.ts"
  - "src/sim/world/kill.ts"
  - "src/sim/world/step.ts"
covered_digest: "v4:sha256:148d02411468a36e912907b0c3bd60d6bfc031b48255c5fbb58e43030f4658f3"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "OC-1: confirm that a pod is one anonymous barrel with no commodity (ROADMAP criterion 1: 'cargo pods ... by Oolite's cargo rule')"
    expected: "The owner accepts that no commodity, amount or pod-role draw is taken (D16-01, D16-24) and that scooping (CBT-11) is unscheduled, so a pod carries a count only. Oolite's `Universe.m:3863-3878` and `3977-3996` commodity draws are not ported."
    why_human: "A deliberate divergence from the wording of criterion 1. The roadmap scope note and PITFALLS 14 support it, but the owner has not signed it off."
  - test: "OC-2: confirm the render-side tumble from the piece's own orientation (D16-10) in place of performTumble's uniform draws"
    expected: "Each piece tumbles differently and the same piece tumbles the same way every run. The entity id may not leave src/sim, so it cannot seed the tumble; this rewords 15-CONTEXT D-03."
    why_human: "Visual fidelity to Oolite and a reworded earlier decision; only the owner can accept it."
  - test: "OC-3: confirm pods, plates and wrecks are not shootable or rammable until Phase 18 (D16-03)"
    expected: "Debris is no laser, ident, ram, mass-lock or jump-blockage candidate in this phase. The roadmap scope note says pods and plates 'can be shot, and are rammed in Phase 18', so the owner must confirm that the shot clause moves to Phase 18."
    why_human: "Criterion 1 / scope-note wording vs. delivered behaviour."
  - test: "OC-4: confirm the explosion blast pushes debris only, not neighbouring ships or the player (D16-04)"
    expected: "Criterion 1 says 'the blast pushing neighbours'. Delivered: every pod, plate and wreck in range is kicked by Oolite's formula, while ships get at most 0.027 m/s and the player under 0.002 m/s in Oolite's own numbers, and ships have no drift integration until Phase 18."
    why_human: "Deliberate narrowing of criterion 1's wording."
  - test: "OC-5: confirm no code fix for the doubled hit sound (D16-14)"
    expected: "`shipHit` has no consumer, so no sound or visual can double. The Phase 15 fix (skip `shipHit` for a target already lethal in `applyLedger`) waits for the first consumer."
    why_human: "The ROADMAP carry-over names a fix; the phase decided it is moot. Owner confirmation needed."
  - test: "OC-6: give the go for `docker compose run --rm verify-full` on this render phase"
    expected: "The full release gate passes on the remote machine. It has NOT been run (it waits on the owner). The targeted gates below are green at HEAD f8eaeaa."
    why_human: "Owner decision on a slow-machine gate; AGENTS.md calls verify-full for render, input, persistence or network-guard changes."
  - test: "OC-7: confirm the debris vendoring run done by the orchestrator (D16-02)"
    expected: "scripts/vendor-oolite.sh's header says a human runs it deliberately. The orchestrator ran it under the owner's standing instruction (commit 8b5cd65). The verifier re-hashed all 14 files against the pinned blobs in /home/opencode/git/oolite and they match; the owner confirms the provenance."
    why_human: "Process deviation; bytes verified, authorisation not verifiable from code."
  - test: "Visual check of the explosion, wreckage burn-down and pod drift in a real GPU browser"
    expected: "A destroyed ship shows a cloud and a white flash, then the wrecks, plate and pods drift and tumble. The container renders on SwiftShader and counts draw calls and decodes assets, but cannot judge how it looks."
    why_human: "Visual appearance cannot be verified programmatically (AGENTS.md; PERFORMANCE.md reference-desktop protocol)."
---

# Phase 16: Wreckage, Cargo and the Entity Cap Verification Report

**Phase Goal:** A destroyed ship explodes into what Oolite leaves behind, alloy plates, cargo pods and wreckage, drawn within the draw-call budget and held under the entity cap, so a fight leaves a field of drifting debris without starving the world of room for ships.
**Verified:** 2026-11-17T02:05:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

Verification was done against the code and not against the SUMMARY claims. The code was read, the pinned Oolite source was compared with the port, the vendored bytes were re-hashed against the pinned commit, and targeted gates were run in Docker on the remote machine at HEAD `f8eaeaa`.

### Observable Truths (ROADMAP success criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | A ship destroyed by the player's laser or a scripted pilot's explodes and leaves alloy plates, cargo pods and wreckage by Oolite's cargo rule, each piece drifting on its own path; the same seed and kill give the same debris at any frame rate | VERIFIED (with OC-1, OC-3, OC-4 deviations flagged below) | `src/sim/world/debris.ts` `releaseDebris` (783 lines) compared line by line with `ShipEntity.m:7814-7879` (pods: 70/40/10 chance, step 30, 15 limit, box point + jitter -3..3 + 0.1x(0..199-100) kick + ship drift) and `8036-8111` (n_alloys = sqrt(sqrt(mass/6000)), n_wreckage = floor(u x (n_alloys+2)) below 3, wreck lifetime 750u+250i+100, energy = lifetime/2, `n_alloys = u x n_alloys`, floor() plates). The call is `killShip` -> `releaseDebris` (`src/sim/world/kill.ts:155`) from `resolveShots` (`src/sim/combat/step.ts:418`), so the laser and the scripted shooter share one path. Every draw comes from a local copy of the victim's own `rng.combat`, written back at the end, in one fixed order; every draw of a piece precedes its spawn attempt. `stepDebris` (`src/sim/world/step.ts:196`) drifts each cargo/wreckage piece by `velocity x dt` per fixed tick, so the frame rate cannot reach it. `tests/sim/world/debris-cadence.test.ts` (30/60/144 Hz equal hashes and debris log, non-vacuous: pod + wreck + plate + removal + blast kick) passes. |
| 2 | Entity cap holds in a crowded fight: debris shed above 243 / 128, a kill still resolves when the world refuses a spawn, no ship fails to spawn or die because of debris, Oolite's frame-time term dropped and recorded | VERIFIED | `DEBRIS_ENTITY_LIMIT = 0.95 x 256 = 243.2` (pods and plates, at most 243 live before a spawn) and `WRECKAGE_ENTITY_LIMIT = 0.5 x 256 = 128` (`debris.ts:186,193`), tested per piece after the piece's draws (`debrisAdmitted`, `wreckAdmitted`). Debris alone never takes the live count above 244, leaving 12 slots for ships. `spawnEntity` returns a refusal object (never throws; `world.ts:501-515`), and the result is ignored, so `killShip` has already marked the victim dead and returned. `tests/sim/world/debris-cap.test.ts` (243/244 boundary, draws independent of the cap, kill at a full store) and `debris-cadence.test.ts` ("sheds pieces at the cap identically at every cadence", "never ... more than 244") pass; the property test "releaseDebris never throws, never needs a repair and never takes the count above 244" passes. The frame-time term `[UNIVERSE getTimeDelta] < 0.125` (`ShipEntity.m:7939`) is not ported and is recorded in the `debris.ts` doc comment, in the PROJECT.md Key Decisions row "Debris is shed per piece at the entity cap" (D16-05) and in FIDELITY.md (row for the gate, line 90, with the Oolite excerpt at line 1215 of the quote block). |
| 3 | Explosion, debris, pods and flashes are drawn in a fixed number of draw calls (within the 50-call budget), live only in the render layer, and never change the world hash (equal with layers on or off, and at 30, 60 and 144 Hz) | VERIFIED | `src/render/bodies/debris.ts`: one `InstancedMesh` per (model, primitive), capacity 256, shared cached geometry and material, so at most 7 models' primitives however many pieces exist. `src/render/bodies/explosions.ts`: a pool of 8, 2 instanced draw objects. Both read only id-free contacts (`debrisContacts`, `src/sim/world/contacts.ts:90`) and the `shipDestroyed` event's position and radius (`event-router.ts:453`); nothing writes to the world. Browser run `tests/e2e/combat.spec.ts` (hook shooter with 20 capsules destroyed in a real session) asserts the debris piece count, `0 < calls <= 50` with the explosion live (measured 21 calls, PERFORMANCE.md line 31) and `worldHash()` 60 ticks after the kill equal to the Node twin's pinned literal (`a10b2dfc`), which has no render layer: PASSED at HEAD. 30/60/144 Hz equality passes (criterion 1 evidence). |
| 4 | Debris models and textures (wreckage, alloy plate, barrel, explosion particle sprites) are vendored from the local Oolite checkout through `scripts/vendor-oolite.sh` with `CHECKSUMS.sha256`, `ASSETS.md` and `NOTICE` rows, load lazily after the first frame, and keep the cold start under 9,437,184 bytes | VERIFIED | `sha256sum -c third_party/oolite/CHECKSUMS.sha256` from the repo root: all 131 lines OK (117 + 14). The 14 vendored files (`oolite_alloy.dat`, `oolite_barrel.dat`, `wreck1-5.dat`, 6 textures incl. `wreck.png`, `oolite-particle-cloud2.png`, `oolite-particle-flash.png`) were re-hashed against `git show 7437f22:Resources/...` in `/home/opencode/git/oolite`: 14/14 equal. Each has a vendored-input row in ASSETS.md; generated GLBs, `ships-debris.json`, `explosions.json` and the two public particle PNGs have generated-asset rows; NOTICE names the derivatives (lines 65-66, 83, 102-116). `assets:check` reports "no differences". Cold start measured at 8,866,124 bytes (traffic off) and 8,878,213 bytes (traffic on) against the 9,437,184 ceiling; `budget.spec.ts` and `traffic.spec.ts` assert no debris GLB, referenced texture or particle PNG is requested before the first in-flight frame, and `combat.spec.ts` shows them requested only after the kill: all PASSED at HEAD. |

**Score:** 4/4 truths verified (0 present but behavior-unverified; every state-transition and cap invariant has a passing test). Status is `human_needed` because the seven owner-confirmation items (OC-1 to OC-7) and the visual check are open, not because a truth failed.

### Plan must-haves

All nine plans' `must_haves` artifacts and key links were checked with `verify.artifacts` and `verify.key-links`: 3/3 + 2/2 (16-01), 6/6 + 3/3 (16-02), 5/5 + 3/3 (16-03), 4/4 + 3/3 (16-04), 4/4 + 3/3 (16-05), 3/3 + 3/3 (16-06), 3/3 + 2/2 (16-07), 3/3 + 3/3 (16-08), 3/3 + 2/2 (16-09). No failures.

### Deferred Items

None. The doubled-hit-sound fix (OC-5), escort release (D16-25, supported because no path spawns an escort) and `ship_kills` are decided in PROJECT.md and not later-phase gaps.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/sim/world/debris.ts` | Pod, wreck, plate and blast rule, cap gates | VERIFIED | Substantive (783 lines), wired from `kill.ts`, total (no throw paths), matches the C |
| `src/sim/world/kill.ts` | `killShip` releases debris | VERIFIED | Calls `releaseDebris` after `shipDestroyed` and notifications, ships only |
| `src/sim/world/step.ts` | `stepDebris` drift and burn-down | VERIFIED | Called from `stepWorld` (line 129); wrecks leave through `killShip` with no `shipDestroyed` |
| `src/sim/combat/octree.ts` | `randomOctreePoint` with a fixed draw budget | VERIFIED | Used by `releaseDebris` |
| `src/content/generated/ships-debris.json`, `explosions.json`, NPC `boundingBox` | Compiled content behind the drift gate | VERIFIED | `assets:check` clean |
| `public/models/{barrel,alloy,wreck1-5}.glb`, two particle PNGs | Generated assets | VERIFIED | ASSETS.md rows present; decode checked by the browser spec |
| `src/render/bodies/debris.ts`, `explosions.ts` | Instanced layers | VERIFIED | Wired through `system-scene.ts` and `render-driver.ts` (lines 196-222) |
| `src/sim/world/contacts.ts` `debrisContacts` | Id-free contacts | VERIFIED | Consumed by `render-driver.ts:201` |
| `src/app/session/traffic.ts` `debrisContentFrom`, `step-options.ts` | Content to the step | VERIFIED | Tick-parity twin pins the kill tick and the world hash |

### Key Link Verification

All 26 links across the nine plans verified by `verify.key-links`; the load-bearing ones were also read in code: `resolveShots` -> `killShip(..., debris)` (`combat/step.ts:418`), `killShip` -> `releaseDebris` (`kill.ts:155`), `stepWorld` -> `stepDebris` (`step.ts:129`), `stepDebris` -> `killShip(world, id, NO_ENTITY, events)` (`step.ts:212`), event router `shipDestroyed` -> `scene.explosions.add`, `render-driver` -> `debris.update` / `explosions.update`.

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Debris layer | `debrisContacts(world)` | live store entities of kind cargo / wreckage | Yes, spawned by `releaseDebris` on a real kill; the browser spec counts them | FLOWING |
| Debris layer | `debrisModels` (radius, tumble rates) | `ships-debris.json` via `loadDebrisCatalogue` in the traffic boot | Yes | FLOWING |
| Explosion layer | `npcTraffic.explosion` | `explosions.json` via `loadExplosionCatalogue` | Yes | FLOWING |
| `releaseDebris` | `DebrisContent.hulls` (mass, fragmentChance, boundingBox) | NPC records through `debrisContentFrom` | Yes (nine hulls with `boundingBox`) | FLOWING |

### Behavioral Spot-Checks (run in Docker on the remote machine, HEAD `f8eaeaa`)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Sim, render, session, content, contract and combat suites | `run --rm test npx vitest run tests/sim/world tests/render/debris-layer.test.ts tests/render/explosion-layer.test.ts tests/app/session tests/content tests/contract tests/sim/combat` | 61 files, 2134 passed, 2 skipped (the two skips are `it.skipIf(OOLITE_SRC === "")` tests that need an Oolite checkout, as designed) | PASS |
| Content drift | `run --rm assets npm run assets:check` | "no differences" | PASS |
| Types | `run --rm typecheck` | exit 0 | PASS |
| Lint and format | `run --rm lint` | exit 0 | PASS |
| Browser: combat, budget, traffic specs | `run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts tests/e2e/budget.spec.ts tests/e2e/traffic.spec.ts"` | 7 passed | PASS |
| QUAL-11 20-seed NPC acceptance (standing gate; `src/sim/world/**` changed) | `run --rm test npm run test:acceptance` | 21 of 21 passed | PASS |
| Vendored bytes | `sha256sum -c third_party/oolite/CHECKSUMS.sha256` plus a comparison with `git show 7437f22:...` in the Oolite checkout | 131 OK; 14/14 equal to the pin | PASS |

`verify-full` was NOT run (waits on the owner, OC-6).

### Probe Execution

SKIPPED: the phase declares no probe scripts (`rg 'probe-.*\.sh'` over the plans and SUMMARYs finds none).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DATA-16 | 16-01, 16-03, 16-05, 16-06, 16-09 | Debris models and textures vendored from the local checkout through `scripts/vendor-oolite.sh` with CHECKSUMS, ASSETS and NOTICE rows | SATISFIED | Criterion 4 evidence; OC-7 pending owner confirmation of who ran the script |
| WORLD-17 | 16-02, 16-04 to 16-09 | Explosions, debris, pods and flashes drawn within the draw-call budget and not affecting the world hash | SATISFIED | Criterion 3 evidence |
| CBT-08 (staged, mapped to Phase 19) | 16-02, 16-04 | Destruction clauses: wreckage, alloy plates, cargo pods, the entity cap | Destruction clauses proved here; the internal-damage clause completes it in Phase 19 | Correctly not checked off |

Bookkeeping for the orchestrator after sign-off: REQUIREMENTS.md still shows DATA-16 and WORLD-17 as `[ ]` / "Pending" (lines 19, 41, 81-82) and the ROADMAP phase 16 list row (line 85) is still unchecked. Both should flip when the owner accepts the phase. No orphaned requirement IDs.

### Anti-Patterns Found

None in the phase's files. `rg "TBD|FIXME|XXX"` over the files changed in the phase hits only two comments in `tools/oolite-ingest/convert/dat.ts` that quote Oolite's own FIXME and date from Phase 2 (commit 565a36d), not debt markers of this phase. No `TODO|HACK`, no stubs.

### Human Verification Required

The items are in the frontmatter `human_verification` list. In short:

1. **OC-1** (no commodity per pod), **OC-3** (pods and plates not shootable until Phase 18) and **OC-4** (blast pushes debris only, not ships or the player) narrow the wording of ROADMAP criterion 1 and its scope note. Each is recorded in PROJECT.md Key Decisions and FIDELITY.md, none is a silent failure, and the owner should confirm the wording is acceptable or amend the roadmap.
2. **OC-2** (render-side tumble from orientation) is a reworded Phase 15 context decision.
3. **OC-5** (no code fix for the doubled hit sound): `shipHit` has no consumer.
4. **OC-6** (`verify-full` pending the owner's go) and **OC-7** (vendoring run by the orchestrator; bytes verified equal to the pin).
5. A visual look at the explosion and debris on a real GPU.

### Gaps Summary

No gaps. All four ROADMAP success criteria hold in the code and under the targeted Docker gates at HEAD `f8eaeaa`. The phase cannot be called closed until the owner answers the OC items and runs or releases `verify-full`.

---

_Verified: 2026-11-17T02:05:00Z_
_Verifier: Claude (gsd-verifier)_
