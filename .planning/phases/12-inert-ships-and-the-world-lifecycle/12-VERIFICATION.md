---
phase: 12-inert-ships-and-the-world-lifecycle
verified: 2026-11-14T21:30:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-01-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-01-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-02-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-02-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-03-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-03-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-04-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-04-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-05-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-05-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-06-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-06-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-07-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-07-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-08-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-08-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-09-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-09-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-10-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-10-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-11-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-11-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-12-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-12-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-13-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-13-SUMMARY.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-14-PLAN.md"
  - ".planning/phases/12-inert-ships-and-the-world-lifecycle/12-14-SUMMARY.md"
  - "src/app/npc-models.ts"
  - "src/app/session/event-router.ts"
  - "src/app/session/frame-loop.ts"
  - "src/app/session/hyperspace-controller.ts"
  - "src/app/session/render-driver.ts"
  - "src/app/session/sim-driver.ts"
  - "src/app/session/traffic.ts"
  - "src/app/session/world-lifecycle.ts"
  - "src/render/bodies/npc-ships.ts"
  - "src/sim/flight/step.ts"
  - "src/sim/flight/torus.ts"
  - "src/sim/sim.ts"
  - "src/sim/world/contacts.ts"
  - "src/sim/world/placement.ts"
  - "src/sim/world/populate.ts"
  - "src/sim/world/ship-field.ts"
  - "src/sim/world/step.ts"
  - "src/sim/world/world.ts"
  - "tests/e2e/traffic.spec.ts"
  - "vite.config.ts"
  - "vite.e2e.config.ts"
covered_digest: "v4:sha256:fac6d9d9b819b5a64c20ca638ecb54d3fa2fafad58bf9f62ef4bef207d1e164f"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Launch `docker compose up preview` (production bundle, traffic on) in a browser. During the launch the ships already show on the scanner, and the DevTools Network panel shows no `models/<npc>.glb` request until the cockpit view appears; after it, the ships are drawn. Press J near a ship and read the message. Open F6 in flight."
    expected: "Ships on the scanner from launch; no NPC GLB request before the cockpit view; ships drawn after it; J near a ship prints 'Hyperspeed mass-locked.'; F6 in flight keeps the ship moving (and a running countdown running) behind the chart."
    why_human: "The plan's manual `<human-check>` (12-14-PLAN.md line 193) was not performed. Visual appearance of the drawn Oolite models, the scanner colours and real-time feel cannot be judged from grep or Vitest; the automated Chromium spec asserts counts and request ordering only."
---

# Phase 12: Inert Ships and the World Lifecycle Verification Report

**Phase Goal:** Inert NPC ships of the six populator roles are placed deterministically, drawn and shown on the existing scanner within the draw-call budget, and mass-lock the torus and block jumps as in Oolite. The world keeps running behind the chart, is cleared at each jump commit, is repopulated on arrival and is regenerated from the save's leg anchor on reload. The world step contains a faulty AI module, and `spawnEntity` refuses malformed input.
**Verified:** 2026-11-14T21:30:00Z
**Status:** human_needed
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria, the contract)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A throwing world-step AI module no longer escapes the step (recorded rule, step completes, deterministic hash); `spawnEntity` with malformed input returns a refusal with a reason and leaves the id counter unchanged; both proven in Vitest before populator code | VERIFIED | `invoke` in `src/sim/world/step.ts:158-186` is the single try/catch: `entity.ai = null`, one `aiFaulted` event, RNG stream written back on both paths; `stepSim` never wraps `stepWorld`. `spawnEntity` (`world.ts:~377`) returns `SpawnResult`; `isMalformedInit` then `domainRefusal` then `idExhausted` then `storeFull`, all before `store.allocate`, so `nextId` is untouched. Tests `tests/sim/world/step.test.ts` (38) and `spawn-refusal.test.ts` (68) pass in local Docker. Waves 1-2 (plans 12-01, 12-02) precede the populator (12-07). Rule recorded in PROJECT.md Key Decisions row 228. |
| 2 | With traffic on, after launch and arrival inert NPC ships of the six roles are placed by a first populator, drawn with their Oolite models, on the existing scanner with no new HUD element; assets fetched only when needed; a populated scene stays within 50 draw calls; `nullAI` ships stay inert | VERIFIED | `populateInertWorld` (`src/sim/world/populate.ts`) places 12 ships over `POPULATOR_ROLES` (6 roles) at Oolite location codes, `ai: null`; the step integrator skips `ai === null` entities (`step.ts:84-92`, D-02). Scanner: `npcContacts` (id-free) feeds `buildHudModel` and `render/hud/draw.ts` (police purple, others neutral yellow). Draw: `render-driver.ts:184-188` feeds `currentScene.npcs.update` (`InstancedMesh` per model, capacity-bounded). Models requested lazily and only after the first drawn in-flight frame (`npcModels.open()` at `render-driver.ts:197`). `tests/e2e/traffic.spec.ts` asserts 12 entities, `calls <= 50` with models loaded, no NPC GLB request while launching, ceiling under 9,437,184 bytes (remote `verify-full` exit 0, 132 Chromium tests, per run context). |
| 3 | Inside mass-lock range the torus does not engage and the message is a refusal ("Hyperspeed mass-locked."), never "Torus disengaged" for a drive that never ran; a jump completing inside a ship's blockage radius (Phase 10 mass) is refused, outside it works; with traffic on launch, docking, docking computer and torus behave as in v1; with traffic off every existing browser test passes unchanged | VERIFIED | `src/sim/world/ship-field.ts` ports `checkEntityForMassLock` (strict `<` at 25,600 m, exempt class list) and the `0.1 x mass > d^2` blockage predicate via `isWitchspaceBlocked`. `torus.ts:222-230` emits `torusRefused` for a drive that never ran; `event-router.ts:261-264` maps it to "Hyperspeed mass-locked.". `flight/step.ts:303` refuses a blocked jump with `blocker: "ship"` after the station check. `tests/app/session/traffic-variants.test.ts` (7) compares launch, manual docking, docking computer and torus with and without the populated world; `ship-field.test.ts` (23), `hyperspace-blockage.test.ts` (10), `torus.test.ts` (25) pass. Browser default off by build-time define (`vite.e2e.config.ts`, `vite.seams.config.ts` set `"false"`; production `"true"`). See the Notes section for the three existing-browser-test edits. |
| 4 | The galactic chart in flight no longer freezes the game: flight, world and a running hyperspace countdown advance behind it; the D-01 check in `tests/e2e/hyperspace.spec.ts` is inverted | VERIFIED | `frame-loop.ts` chart branch calls `simDriver.advanceBehind(delta)` when `inFlight`, not paused, not manual clock; docked it stays frozen. `sim-driver.ts:239-255` steps with `[]` and `ZERO_FRAME`. `sim-driver.test.ts` "keeps a running countdown decrementing" and `session-order.test.ts` pass. A dock or arrival behind the chart calls `closeChart` (`hyperspace-controller.ts`). The hyperspace spec now asserts the clock advances (`toBeGreaterThan`), diff in commit 4d38aea. |
| 5 | A jump removes every non-static entity at jump commit and the destination is populated deterministically (same route and seed give the same ships, ids, hash); reloading regenerates the inert world at the leg anchor, hashing identically to a fresh arrival, completing SAVE-08 | VERIFIED (with WR-01 warning) | `sim.ts` does not step the old world on the `hyperspaceJumped` step; `handleHyperspaceJumped` calls `worldLifecycle.begin(nextSeed)` in the synchronous install block, building a fresh `createWorld` (ids restart at 101, 12 ships, anchor 113). `world-lifecycle.test.ts` (55) covers "jump commit clears the world on the same tick", "arrival ... same ships for the same route, seed and epoch (WORLD-14)", "regenerates the same world after resetForRestore and resume as begin built, with anchor 113 (SAVE-08)", cold Continue vs warm Load agreement, and "SaveInputs ... identical with and without a live world" (NPCs are not saved). `save-v3.test.ts` (51) passes. The one exception path is WR-01 below. |

**Score:** 5/5 roadmap truths verified (0 present, behavior-unverified). Every behavior-dependent truth (AI containment, id-counter on refusal, same-tick clear, chart-behind stepping, regeneration hash) is backed by a named passing Vitest case I re-ran, not by symbol presence.

### Required Artifacts (from PLAN frontmatter, `verify.artifacts`)

All 14 plans: every declared artifact exists, is substantive and passes `verify.artifacts` (14/14 plans, no `issues`). Key artifacts spot-read: `src/sim/world/step.ts`, `world.ts`, `populate.ts`, `placement.ts`, `ship-field.ts`, `contacts.ts`, `src/app/session/traffic.ts`, `world-lifecycle.ts`, `src/render/bodies/npc-ships.ts`, `src/app/npc-models.ts`, `tests/e2e/traffic.spec.ts`.

### Key Link Verification (`verify.key-links`)

| Plan | Result | Details |
|------|--------|---------|
| 12-01, 12-02, 12-04 to 12-14 | all links verified | `verify.key-links` returns N/N |
| 12-03 | 1/2 by tool; both wired | The tool failed to match `parseTestFlags\(window\.location\.search, __WEGOLITE_TRAFFIC_DEFAULT__\)` because the call spans lines. Manually confirmed: `start-session.ts:312-314` calls `parseTestFlags(` with the `window.location.search` argument and `__WEGOLITE_TRAFFIC_DEFAULT__`; the define is set in all four configs. Tool false negative, not a gap. |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| NPC instanced layer | `contacts` | `npcContacts(worldLifecycle.world)`, world built by `populateInertWorld` from the compiled `ships-npc.json` catalogue | yes | FLOWING |
| Scanner contacts | `HudModel.contacts` | same `contacts` array through `buildHudModel` | yes | FLOWING |
| Mass lock and blockage | `ShipField` | `world.store.live` plus `shipMasses` from the compiled catalogue via `buildStepOptions` | yes | FLOWING |

### Behavioral Spot-Checks (local Docker, one targeted run)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| FOUND-15, FOUND-16, populator, contacts, mass lock, blockage, torus, lifecycle, WORLD-14 variants, tick parity, save v3, event order, sim driver, NPC layer | `docker compose run --rm test npx vitest run` over 14 named files (step, spawn-refusal, ship-field, populate, contacts, hyperspace-blockage, torus, world-lifecycle, traffic-variants, tick-parity, save-v3, session-order, sim-driver, render/npc-ships) | 14 files, 428 tests passed | PASS |
| Full gate | remote `verify-full` and `e2e-cross` (run context, not re-run by me) | exit 0; 3020 Vitest, 132 Chromium, 2 seams | PASS (reported) |

### Probe Execution

Step 7c: SKIPPED. The phase declares no `probe-*.sh` scripts; `scripts/*/tests/probe-*.sh` is not part of this project's verification.

### Requirements Coverage

Plan frontmatter IDs (union across 12-01 to 12-14) equal the eight phase IDs; none is missing and REQUIREMENTS.md maps no other ID to Phase 12 (no orphans).

| Requirement | Source plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| FOUND-16 | 12-01, 12-02 | `spawnEntity` refuses malformed input with a reason, no id advance | SATISFIED | `SpawnResult` contract; `spawn-refusal.test.ts` 68 tests; 40 call sites migrated |
| FOUND-15 | 12-02 | Throwing AI module contained, deterministic hash | SATISFIED | `invoke` containment; `step.test.ts` fault cases (think, event, string throw, stream write-back) |
| WORLD-15 | 12-06, 12-07, 12-08, 12-10, 12-11, 12-12 | Six-role inert ships, drawn, on scanner, 50-call budget, nullAI inert | SATISFIED | populator, contacts, instanced layer, `traffic.spec.ts` (draw-call and cold-start assertions). Visual quality is a human item. |
| WORLD-10 | 12-04, 12-05 | Mass lock and blockage by ships; correct refusal message | SATISFIED | `ship-field.ts`, `torusRefused`, "Hyperspeed mass-locked." |
| WORLD-11 | 12-13, 12-14 | Simulation runs behind the chart in flight, countdown included | SATISFIED | `advanceBehind`, chart branch, inverted hyperspace spec |
| WORLD-14 | 12-07, 12-09 | Jump commit clears, arrival repopulates deterministically | SATISFIED (WR-01 warning) | lifecycle tests; see WR-01 below |
| WORLD-16 | 12-03, 12-09, 12-12, 12-14 | Traffic-on parity with v1; browser default off; sanctioned exceptions | SATISFIED | `traffic-variants.test.ts`, build-time define, contract test |
| SAVE-08 | 12-09, 12-12 | NPCs not saved; reload regenerates the world at the leg anchor, same hash | SATISFIED | lifecycle load tests, `save-v3.test.ts`, e2e reload scanner test |

### Anti-Patterns Found

Scan over the 44 files changed under `src/`, `tools/` and the build configs since the phase started: no `TBD`, `FIXME`, `XXX`, `TODO` or `HACK` marker. No stub returns on the rendered path.

### Owner decisions honoured (not gaps)

- Buoys stay non-blocking in Phase 12 (PROJECT.md row 253, todo `2026-11-14-make-buoys-block-hyperspace-like-oolite.md`).
- The `traffic=1` entity count (0 to 12) in `tests/e2e/tick-hook.spec.ts` is sanctioned in REQUIREMENTS.md WORLD-16.
- NPC model requests deferred to the first in-flight frame (row 260); DATA-13 kept.
- CONTEXT D-01 to D-04 all honoured and recorded as Key Decisions rows (D-01 counter 113 on / 101 off, row 238; D-02 inert hold, `step.ts:84-92`; D-03 `MAX_STEPS_PER_FRAME` kept, row 261; D-04 containment, row 228).

## Warnings and notes

### WR-01 (code review): a refused `begin()` at a hyperspace arrival leaves the origin world installed. Warning, not a gap.

I confirmed the code path. `begin` (`world-lifecycle.ts:158-173`) returns with the world untouched when the epoch is at `MAX_LIVE_EPOCH` (0xfffffffe) or the seed is not finite, and `handleHyperspaceJumped` (`hyperspace-controller.ts:239`) calls `begin(nextSeed)` without ending the old world first. In that state the origin's 12 ships would survive into the destination, and `anchorNextEntityId` would stay stale.

Judgement: not a goal-blocking gap. The non-finite seed branch is unreachable (`arrivalMarketSeed` is finite by construction). The epoch branch needs a save whose `epoch` is exactly 4,294,967,294, which no play can reach (one bump per launch or jump) and only a hand-edited local save can contain; the schema allows it, but the harm is limited to the editing player's own offline session. Every reachable arrival honours WORLD-14, as the lifecycle tests show. It is still a real invariant hole ("cleared at each jump commit" is not unconditional), the comment at `hyperspace-controller.ts:236-238` over-claims ("cannot throw" is true, "cannot refuse" is not), and the fix is one line (`ctx.core.worldLifecycle?.end()` before `begin`, or clear on every refusal path inside `begin`). Recommendation: fix it before the milestone closes, with a controller-level test; it does not need to block the phase. It is carried here as a warning and not placed in `gaps:`.

### Existing browser tests changed in Phase 12 (SC3 "pass unchanged")

Three existing assertions changed, not two. The first two are named in REQUIREMENTS.md WORLD-16; the third is not:
1. `hyperspace.spec.ts` chart-freeze check inverted (named, owner 2026-11-13).
2. `tick-hook.spec.ts` opt-in `traffic=1` entity count 0 to 12 (named, owner 2026-11-14).
3. `tick-hook.spec.ts` "the clock and traffic flags are inert without ?test=1": URL `traffic=0` to `traffic=1` and `before.traffic` `true` to `false` (commit 1ef2a21). It is a direct consequence of the owner's build-time traffic-default decision (PROJECT.md row 240, recorded in plan 12-03 and its SUMMARY), and it preserves the test's intent (the URL cannot change traffic without the hook). Not a gap; the WORLD-16 text in REQUIREMENTS.md should be amended to name it so the "unchanged except" list is complete.

### Info items from the review (not gaps)

IN-01 (a running torus stopped by mass lock still prints "Torus disengaged"; Oolite prints "Hyperspeed mass-locked."), IN-02 (`aiFaulted` has no recorder, latent until Phase 13), IN-03 (`spawnEntity` "never throws" over-claims for throwing getters, unreachable in-repo), IN-04 (a failed NPC model is never retried). None contradicts a success criterion; SC3 speaks only of a drive that never ran. IN-01 and IN-02 are worth scheduling with Phases 13/14.

## Human Verification Required

### 1. Production-bundle smoke in a browser

**Test:** `docker compose up preview`, open the game with traffic on (production default). Launch; watch the scanner and the DevTools Network panel; reach the cockpit view; press J near a ship; open F6 in flight.
**Expected:** ships on the scanner from launch; no `models/<npc>.glb` request until the cockpit view appears; ships drawn afterwards; J near a ship prints "Hyperspeed mass-locked."; the ship keeps moving behind F6.
**Why human:** the plan's manual `<human-check>` (12-14-PLAN.md) was not performed, and appearance and real-time feel of the drawn Oolite models cannot be verified programmatically.

## Gaps Summary

No blocking gaps. All five roadmap success criteria and all eight requirement IDs are backed by code I read and by passing tests I re-ran locally in Docker, with the full gate reported green on the remote machine. The status is `human_needed` solely because the manual browser check was not performed. One Warning (WR-01) and one requirements-text omission (the third edited browser test) are recorded for follow-up.

---

_Verified: 2026-11-14T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
