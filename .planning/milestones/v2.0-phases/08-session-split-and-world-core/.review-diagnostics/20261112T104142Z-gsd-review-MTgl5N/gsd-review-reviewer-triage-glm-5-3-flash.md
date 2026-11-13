# Round 2 Triage Review — Phase 8 Plans (08-01 … 08-16)

**Reviewer role:** fast triage peer review (Round 2). Read-only; no tracked files modified.
**Evidence tier:** Verify (Tier 2) — parent-supplied graph evidence (project `wegolite`, generation 2026-11-12T10:03:36Z, fresh) plus direct `rg`/file spot-checks of the load-bearing anchors cited by the plans.

### Summary

All 16 plans are internally consistent, correctly sequenced in 9 waves, and every Round-1 (10b4108) finding I traced has been folded into the plan text, must_haves, acceptance gates and threat registers — the dispositions ledgers are accurate, not cosmetic. I independently re-verified the load-bearing source anchors (9 exports and 3,365 lines in `src/app/game-session.ts`, the single `case "docked":` at 2321, 5 `redrawGate.request()` sites, `renderFrame(alpha, shouldDraw())` at 2863, the inline `URLSearchParams` read at 3185, `marketSeedForSystem`/`arrivalMarketSeed`/`witchspaceStationMass`/`InputFrame`/`mapHyperspaceBeginEdges`/`GameLoop.advance`, the ESLint baseline bans, the single sim-side `createSeededRandom` caller at `src/sim/hyperspace/arrival.ts:73`, and all referenced e2e spec and helper filenames — all exist and match). Oolite `OOScanClass.tbl` has exactly 16 entries including `CLASS_PLAYER` (100), so plan 08-05's vocabulary and 08-07's player scan class are mutually consistent. I found **no blocker**; two warnings deserve attention before execution starts, one of them a latent contract inconsistency at the boot-Continue boundary.

### Strengths

- **Round-1 dispositions are real.** Every HIGH concern from the consensus summary is now concrete plan machinery, not prose: 08-02's same-commit vector pinning with an independent scratch re-implementation; 08-05's exported `isNeverSpawned` predicate with an anti-re-spelling gate; 08-08's recorded `loadFromSave` sequence driven through injectable `SaveControllerDeps`; 08-10's six pre-launch-autosave cases and no-`never`-check gate; 08-12's pinned-literal audit table and lifecycle-order header comments; 08-15's step-cost benchmark with a hard bound and a conditional hash-neutral fast path.
- **Gate-attribution discipline is uniform and executable.** Every plan shares the same porcelain/docker-ps precondition plus detached-worktree fallback with commit + tree SHA recording; split-step gates (08-06 step 3, 08-08 step 6, 08-12 step 9) also gate on no stray containers/volumes.
- **Acceptance criteria are mechanically checkable.** Nearly every gate is an `rg`/`node -e`/`git diff` one-liner with a stated HEAD baseline, which makes execution drift detectable without running the slow gates.
- **The determinism story closes its known gaps.** 08-03 bans the Math-alias forms Round 1 flagged, documents the residual laundered-value gap, and points to the behavioural proofs; 08-11 records the within-one-engine (V8) scope as Key Decisions row (f) instead of overclaiming; 08-16's parity asserts equality to `hashFlight` too, so browser and Node cannot agree on the same wrong hash.
- **Anti-overfitting guards are explicit.** 08-11 pins the placeholder integrator with exactly one labelled test, forbids goldens that pin a populated world, and gates `git diff --name-only 5b189e4 -- tests/golden` to the single new world golden; 08-13's `Record<keyof Entity, …>` field table keeps the hash serializer and the Phase 11 codec from drifting.
- **Scope notes and the no-renumbering rule are consistently applied**, with owner-accepted over-budget estimates recorded per plan rather than hidden.

### Issues Found

- **Severity: WARNING**
  **Plan/Task:** 08-15, Task 2 (step 2) and Task 3 (Key Decisions row)
  **Description:** A fresh `createWorldLifecycle` (epoch 0) is created at every `startSession` *before* the restore branch, and a boot-time Continue of an **in-flight** save then calls `resume(marketSeed)` without a bump — so the recreated world is `worldSeedFor(ms, 0)` while the world the player actually saved in was `worldSeedFor(ms, ≥1)` (every begin bumps to ≥1). The D-05 parity test in Task 2 only exercises `resume` on a *continuing* lifecycle (epoch 3 → 3), which is the in-session Load case; the boot-Continue-after-quit case is not tested and silently yields a different world seed than the pre-save world. In Phase 8 this is unobservable (NPC-free never-spawned worlds hash as `hashFlight` regardless of seed, `populateNothing` adds nothing), but it contradicts the leg-anchor rationale quoted in 08-05 row (d) and CONTEXT's deferred note ("the persisted `nextEntityId` is the issuing world's own counter, saved so that the same world regenerates at the leg anchor") unless Phase 11's persisted epoch is consumed by `resume`. As written, nothing in the plans tells Phase 11 that the start-up wiring must change.
  **Fix:** Add one sentence to 08-15's Key Decisions row and the `WorldLifecycle` doc comment: "In Phase 8 a boot-time Continue of an in-flight save resumes at epoch 0 (the lifecycle is fresh at start-up), so the recreated seed can differ from the saved world's; this is Phase-8-only and Phase 11 (SAVE-07) must make `resume` take the persisted epoch (and `startSession` must not pre-reset it)." Optionally add a lifecycle test asserting `createWorldLifecycle({traffic}).resume(s)` leaves epoch 0, documenting the stand-in.

- **Severity: WARNING**
  **Plan/Task:** 08-15, Task 1 step 1 (`begin`) vs 08-02 Task 3 (`worldSeedFor` RangeError)
  **Description:** 08-15 promises "a non-finite marketSeed leaves the state unchanged and never throws" because lifecycle methods run inside a fixed step (threat T-08-27: "a throw would stop the frame loop"). But `worldSeedFor` (08-02) deliberately throws `RangeError` for `epoch` outside `[0, 0xffffffff]` — and `begin` does `epoch += 1` with no upper guard, so an epoch at 2^32 throws inside router dispatch inside `stepOnce`, crashing the frame loop. Probability is negligible in practice (4 billion launches), but the plan's own safety invariant ("lifecycle methods must not throw inside fixed-step execution", Task 3) is not actually total.
  **Fix:** One line in `begin`: refuse (leave state unchanged) when `epoch` would exceed `0xffffffff`, matching the non-finite-seed treatment, and add a lifecycle behaviour row for it.

- **Severity: SUGGESTION**
  **Plan/Task:** 08-09, Task 1 step 3 / Task 2
  **Description:** The test pilot calls `ctl.scheduleWake(self, ticks(0.1 + random()*1.5))` at the end of *every* think while thinking every 15 ticks; with the never-later rule, after the first think `wakeTick` is pinned at the earliest ever scheduled value (~12) and thereafter either is already past (cleared) or merely duplicates the 15-tick cadence. The wake-earlier-than-next-think path is therefore never meaningfully exercised by the pilot (stepWorld's `wakeDue` branch is tested only by 08-11's injected-registry tests). Harmless for Phase 8, but the pilot is the Phase 13 shooter and the wake mechanism's only real-code user.
  **Fix:** Either have the pilot skip `scheduleWake` when a wake is already pending, or add one pilot test that a wake due before `nextThinkTick` produces an earlier think through `stepWorld` (an integration case in 08-11 Task 1's tracer list).

- **Severity: SUGGESTION**
  **Plan/Task:** 08-16, Task 2 step 1 (vs 08-02 `recorded-flights.ts`, 08-13 Task 3)
  **Description:** By phase end the repo holds three independent Node replays of session semantics: `tests/helpers/recorded-flights.ts` (v1 hash pins), the world-cadence test's inline lifecycle, and `tests/helpers/tick-script.ts`. Each mirrors `game-session.ts`/session modules separately, so they can drift independently of the session and of each other. 08-16 mitigates for its own script (setup-value header mapping + per-tick trace) but not against the other two.
  **Fix:** In tick-script's header, state explicitly that it supersedes `recorded-flights.ts` for *post-split session semantics* and that 08-02's pins remain the frozen v1 evidence; note in 08-02's helper that it is a phase-baseline artifact not to be updated after the split.

- **Severity: SUGGESTION**
  **Plan/Task:** 08-05, Task 1 step 6
  **Description:** The sentence "returning '' while `isNeverSpawned(world)` holds (… worldSeed, epoch and nextId are deliberately excluded so D-08 survives …), otherwise lines `worldSeed=`, `nextId=`, `rng=` …" reads as self-contradictory on first pass (excluded vs emitted). The intent is clear (excluded only in the never-spawned case), but an executor implementing the serializer could mis-read it.
  **Fix:** Split into two sentences: "While `isNeverSpawned` holds the section is empty — no `worldSeed`/`nextId`/`rng` lines, which is what keeps D-08 across launch and arrival. Once anything has spawned, the section begins with `worldSeed=`, `nextId=`, `rng=`."

### Missing Coverage

- **Jump parity inside `advanceTicks`** — 08-16's flagged assumption honestly records that hash parity is proven only for the New-game launch-and-fly script; a jump run through `advanceTicks` (arrival path) has no parity fixture this phase. Acceptable, but it should also appear in the Phase 12 hand-off notes since chart-in-flight simulation (Phase 12) will change exactly that path.
- **`epoch` overflow in `begin`** — see WARNING 2 above (an edge the "never throws inside a fixed step" invariant claims but does not deliver).
- **Boot-Continue epoch semantics** — see WARNING 1; no test pins what `resume` on a fresh lifecycle does.
- **Coverage floors for `src/app/session/**`** — the split adds ~10 new app modules; the plans repeatedly gate `src/sim` floors but never state whether the app glob's thresholds apply to the new session modules and whether the extracted controllers (partially moved bodies) can meet them. If app floors exist in `vitest.config.ts`, several Node-only-tested modules (e.g. `world-lifecycle.ts`) may land short. Worth a one-line check when 08-04 lands.
- **`probe.sim` publication cost** — `entities` is computed by iterating the store every `updateProbe` per frame; O(≤256) and negligible, but a one-line comment ("live-count is O(n), n ≤ MAX_ENTITIES") would preempt a later "why is probe slow" investigation.

### Recommendations

1. (Before 08-15 execution) Resolve the two WARNINGs: record the boot-Continue epoch-0 caveat in the Key Decisions row/doc comment, and make `begin` total against epoch overflow. Both are one-to-three-line plan text edits.
2. (Before 08-09 execution) Decide the pilot's `scheduleWake`-every-think semantics (skip-when-pending vs keep) so the pilot's recorded call lists in Task 2's 200-think test are stable rather than accidental.
3. (During 08-04) Confirm whether `vitest.config.ts` coverage thresholds cover `src/app/session/**` and record the answer in 08-04's SUMMARY so later split plans don't discover it at the step-9 worktree gate.
4. Keep the plan numbering and waves exactly as they are — the dependency graph (08-04←08-01, 08-05←08-02, 08-07←08-05, 08-09←08-07+08-03, 08-10←08-08, 08-11←08-09, 08-12←08-10, 08-13←08-11, 08-14←08-12, 08-15←08-14+08-11, 08-16←08-15) is acyclic, matches the ROADMAP wave table line-for-line, and the shared-tree conflict pairs (08-04/08-05, 08-06/08-07, 08-08/08-09, 08-10/08-11, 08-12/08-13) each touch disjoint file sets under D-14.
5. No further round of plan revision is needed for the other 14 findings-less plans; proceed to execution with the two plan-text patches above.

### Overall Assessment

**READY** — with the two small WARNING-level plan-text patches (08-15 boot-Continue epoch caveat; 08-15 epoch-overflow totality) recommended before the Wave 8 integration plan executes. No blocker; no structural rework needed.

### Reviewed Plans

- 08-01
- 08-02
- 08-03
- 08-04
- 08-05
- 08-06
- 08-07
- 08-08
- 08-09
- 08-10
- 08-11
- 08-12
- 08-13
- 08-14
- 08-15
- 08-16
