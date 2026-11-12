---
phase: 8
reviewers: [reviewer-architect-kimi-k3-1-pro, reviewer-correctness-glm-5-3, reviewer-algorithm-deepseek-v4-pro, reviewer-adversarial-grok-4-7, reviewer-context-gemini-4-argon, reviewer-triage-glm-5-3-flash]
reviewed_at: 2026-11-12T10:41:06Z
plans_reviewed: [08-01-PLAN.md, 08-02-PLAN.md, 08-03-PLAN.md, 08-04-PLAN.md, 08-05-PLAN.md, 08-06-PLAN.md, 08-07-PLAN.md, 08-08-PLAN.md, 08-09-PLAN.md, 08-10-PLAN.md, 08-11-PLAN.md, 08-12-PLAN.md, 08-13-PLAN.md, 08-14-PLAN.md, 08-15-PLAN.md, 08-16-PLAN.md]
models:
  reviewer-architect-kimi-k3-1-pro: "opencode-go/kimi-k3.1-pro"
  reviewer-correctness-glm-5-3: "opencode-go/glm-5.3"
  reviewer-algorithm-deepseek-v4-pro: "opencode-go/deepseek-v4-pro"
  reviewer-adversarial-grok-4-7: "opencode-go/grok-4.7"
  reviewer-context-gemini-4-argon: "opencode-go/gemini-4-argon"
  reviewer-triage-glm-5-3-flash: "opencode-go/glm-5.3-flash"
model_sources:
  reviewer-architect-kimi-k3-1-pro: "config"
  reviewer-correctness-glm-5-3: "config"
  reviewer-algorithm-deepseek-v4-pro: "config"
  reviewer-adversarial-grok-4-7: "config"
  reviewer-context-gemini-4-argon: "config"
  reviewer-triage-glm-5-3-flash: "config"
refused_reviewers:
  claude:
    estimated_tokens: 152123
    cap: 130000
    cap_source: lane
---

# Cross-AI Plan Review — Phase 8

<!-- gsd:plan-revision-conflicts:begin -->
## Plan-Revision Conflicts
<!-- gsd:plan-revision-conflicts:end -->

## Claude Review

claude review did not run: prompt exceeds this lane's context cap (estimated 152123 tokens exceeds the 130000-token cap for lane 'claude' (source: context-window, 200000-token context window); raise review.context_window_tokens.claude if this lane's model has a larger window, or set it to 0 to remove the cap)

---

## Architecture Review (reviewer-architect-kimi-k3-1-pro)

### Summary

Commit `83c9b5c` materially addresses the Round 1 findings on paper: it adds explicit seed vectors, live-object and ordering characterisations, gate attribution, hot-path measurement, schema/sanitiser properties, and browser/Vitest parity diagnostics. Two cross-plan contracts remain unsafe: warm in-session Loads reuse the wrong world epoch, and the “total” sanitiser does not cover every hashed/snapshotted value. **NEEDS REVISION** before execution; the required changes are local in concept but affect the phase’s core determinism and failure-propagation guarantees.

### Strengths

- The dependency chain is complete and coherent: `08-01..08-03` establish safety nets; each split/core chain converges through `08-10/08-11`, `08-12/08-13`, and `08-14`; `08-15` integrates them and `08-16` is the sole downstream probe change. Same-wave `files_modified` ownership avoids cross-track file collisions.
- `FlightState` remains the player authority and `World` remains dynamic-entity state. Static bodies reference `SystemLayout`, the player is supplied to views per call, and empty-world hashing composes with rather than modifies `serializeFlight` (`08-05`, `08-07`, `08-11`).
- The AI seam has useful structural enforcement: copied views, actor-bound controls, type-only public interfaces, narrow imports, queued cross-entity events, integer timers, and separate registry dispatch (`08-07`, `08-09`, `08-11`). These are stronger than conventions alone.
- The split preserves the actual runtime ordering found in `src/app/game-session.ts`: the pre-launch save precedes launch (`src/app/game-session.ts:2765-2795`), events are handled immediately after stepping (`src/app/game-session.ts:2837-2853`), and the arrival install/autosave order is atomic (`src/app/game-session.ts:2125-2152`). The revised plans pin those paths with behavioural tests rather than relying only on compilation.
- Snapshot discipline is unusually thorough: strict typed boundary errors, id gaps and killed-highest-id cases, key-order independence, an exhaustive entity-field table, and a 1,000-tick equality run (`08-13`). The one additive probe change is also properly sequenced after the freeze (`08-16`).

### Issues Found

#### 1. **Severity: BLOCKER** — Warm `Load` carries the previous session's epoch into a save that never contained it

- **Plan/Task:** `08-15`, Tasks 2 and 3 (also missing from the lifecycle proof in `08-13`, Task 3).
- **Description:** `createWorldLifecycle` starts at epoch 0 and `resume` deliberately leaves the current epoch unchanged (`08-15-PLAN.md:127,162-164`). Start-up constructs a fresh lifecycle, but the in-session `loadFromSave` integration only calls `resume(seed)` for in-flight saves or `end()` for docked saves (`08-15-PLAN.md:171,202`). Its mandatory test explicitly blesses “leaves epoch unchanged” (`08-15-PLAN.md:205`). That is not equivalent to a cold Continue of the same save once the current session has advanced its counter. D-03 keeps epoch out of Phase 8 saves (`08-CONTEXT.md:29-30`), while D-02 promises that reloading and launching reproduces the world (`08-CONTEXT.md:28-30`; `.planning/research/ARCHITECTURE.md:471`). The live loader is intended to follow the exact boot pipeline (`src/app/game-session.ts:1316-1324`), so retaining prior-session world state conflicts with that boundary as well.
- **Concrete failure:** Launch (epoch 1), jump (epoch 2), then use F2 to load an older v2 save. Warm Load leaves epoch 2; a cold page load of the same save creates a lifecycle at 0. The next launch produces epoch 3 in the warm path versus epoch 1 in the cold path. `worldSeedFor` therefore derives different worlds and `probe.sim.epoch` disagrees; once traffic exists, entity streams, ids, hashes, and gameplay diverge solely because Load happened in an existing tab. A docked Load has the same defect on its next launch because `end()` also preserves epoch.
- **Fix:** Introduce an explicit restore/reset operation that sets the save anchor's epoch before creating/ending the restored world. In Phase 8 that value should be whatever a fresh boot of the same v2 save would use (0 under D-03); Phase 11 can supply the persisted anchor value. Apply it only in the successful synchronous install block, for both docked and in-flight Loads, leaving failed parses untouched. Add a test comparing cold Continue versus warm in-session Load of the same blob, followed by another launch and arrival, asserting identical epoch, world seed, next id, and hashes.

#### 2. **Severity: BLOCKER** — The total sanitiser/schema invariant excludes values that the hash serialises

- **Plan/Task:** `08-05`, Task 1; `08-09`, Task 1; `08-11`, Task 2; `08-13`, Tasks 1-2.
- **Description:** `serializeEntity` hashes every entity field and canonicalises every number (`08-05-PLAN.md:135,138`), while `canon` throws on non-finite input (`src/sim/hash.ts:29-34`). Yet `sanitizeEntity` repairs only position, orientation, destination, speed, desired speed/range, and AI timers (`08-11-PLAN.md:160-165`). It does not cover radius, owner id, spawn tick, RNG states, repairs, or numbers inside `AiComponent.params` and its arrays, even though those fields are part of the entity and snapshot (`08-13-PLAN.md:107,139-140`). The fast-check property avoids the contradiction by generating those other fields only from valid domains and never generating non-finite AI params (`08-13-PLAN.md:140`). Thus “no non-finite value can reach the hash” (`08-11-PLAN.md:179`) and “every sanitized world snapshots to JSON the parser accepts” (`08-13-PLAN.md:24`) are stronger than the actual design.
- **Concrete failure:** An AI module computes an overflowing value and stores `NaN` or `Infinity` in `ctx.ai.params`, or a spawn/content mistake produces `radius = Infinity`. The next `worldHash()` still reaches `canon` and throws, despite the per-tick sanitiser. JSON snapshotting changes the same value to `null`, after which the strict parser rejects rather than restores it. The Round 1 NaN-injection test covers position only, so this failure survives every planned proof.
- **Fix:** Make finite validity a field-complete contract, not a selected-field repair list. Validate constructor-only numeric fields at `spawnEntity`, and either validate/repair all mutable serialised numerics (including nested AI params/arrays) or explicitly exclude them from hashing/snapshot with a recorded decision. Extend the exhaustive `Record<keyof Entity, ...>` mechanism to generate invalid-domain cases for every numeric leaf, and test `stepWorld -> hashWorld` and `sanitize -> JSON -> parse` for each path. Keep constructor invariants and repair-count semantics explicit so normalisation does not silently hide corrupt content.

#### 3. **Severity: WARNING** — `08-10` and `08-15` require incompatible event-router ownership tests

- **Plan/Task:** `08-10`, Task 2; `08-15`, Task 1.
- **Description:** `08-10` requires every one of the 14 existing event kinds to have exactly one subscriber and tests one handled entry per dispatch (`08-10-PLAN.md:28,33,155,160-161,174`). `08-15` changes `launched` and `docked` into ordered fan-out to `stationFlow` plus `worldLifecycle` (`08-15-PLAN.md:130`) but simultaneously instructs the executor to preserve the one-handler-per-kind assertions unchanged (`08-15-PLAN.md:131`). Those requirements cannot all pass. Removing the assertion without replacing its routing guarantee would also permit accidental extra business side effects.
- **Fix:** Replace the invariant with an explicit ordered routing table: each kind has exactly one gameplay subscriber, and only `launched`/`docked` additionally have the whitelisted lifecycle subscriber. Update the `08-10` truth accordingly. In `08-15`, assert exact per-kind subscriber sequences for all 14 kinds, and add full side-effect logs for launched and docked proving `stationFlow` completes before `worldLifecycle`; retain the emission-order and reserved-kind pass-through tests.

#### 4. **Severity: SUGGESTION** — Do not make the whole mutable `SessionState` the permanent boundary of every extracted module

- **Plan/Task:** `08-04`, Task 1, propagated by `08-06`, `08-08`, `08-10`, `08-12`, `08-14`, and `08-15`.
- **Description:** The extraction moves the closure's variables into one shared object (`08-04-PLAN.md:115-119`) and every controller factory receives that same object. This removes stale lexical captures but does not constrain authority: a render/probe controller can write flight, save, or world state; a station/save controller can bypass the sim driver; and later changes can introduce hidden ordering dependencies that the type system cannot catch. The file split would otherwise look complete while retaining the monolith's coupling.
- **Fix:** Keep the concrete shared `SessionState` for behaviour-neutral extraction, but give each factory a narrow structural context facet (`Pick`/nested picks) plus explicit command/callback capabilities. In particular, reserve world mutation for lifecycle and sim-driver contexts and give read-only publishers read-oriented facades. This can be introduced without changing runtime objects or the nine-name public facade, and will make the boundary enforceable rather than merely documented.

### Missing Coverage

- **Warm-versus-cold restore equivalence:** No planned test loads the same old save through both boot Continue and in-session Load and then performs another populate. Current tests only assert the incorrect “epoch unchanged” behaviour.
- **Full numeric-domain failure propagation:** There is no NaN/Infinity case for AI params (including arrays), radius, owner id, spawn tick, stream states, repairs, or world-level numeric fields, despite those fields entering the hash/snapshot schema.
- **Non-vacuous traffic parity:** The D-05 checks use `populateNothing` or a recording callback (`08-15-PLAN.md:33,162`). They prove the lifecycle itself has no conditional, not that a real traffic-on populator and traffic-off path consume identical id/epoch sequences. Record this as a deferred integration proof or add a conditional spawning fake with the intended off-path id reservation semantics.
- **Manual-launch handshake:** The browser parity case clicks Launch and immediately calls `advanceTicks(1)` (`08-16-PLAN.md:162`) without waiting for a frame to transfer the station action into the driver's pending commands. On a slow frame the launch can be applied one tick later than the Node script, making parity timing-dependent. Wait on `probe.frames` after the click before stepping.
- **Lifecycle side effects inside tick stepping:** `08-16` explicitly leaves hyperspace parity unproven (`08-16-PLAN.md:189`). At least one successful and one failed jump through `advanceTicks` should compare tick, epoch, world identity/seed, pause state, and hash so the shared event path is proven beyond launch/fly.

### Recommendations

1. Resolve the save-anchor epoch contract first and add warm/cold equivalence tests before implementing `08-15`; otherwise later world determinism will depend on tab history.
2. Define one field-complete validity invariant across `Entity`, `hashWorld`, `sanitizeEntity`, and `WorldSnapshot`; drive invalid-domain tests from that same field map in `08-05`, `08-11`, and `08-13`.
3. Make event routing a declarative ordered table and align `08-10`/`08-15` before changing the router; test both individual arm order and whole-event side-effect order.
4. Treat shared `SessionState` as an implementation carrier, not a public capability bundle; add per-module facets as each controller is extracted rather than allowing all modules unconstrained writes.
5. Close the remaining non-vacuity gaps: a real conditional-populator parity proof when traffic exists, an explicit launch-drain wait in browser parity, and one jump lifecycle case through `advanceTicks`.

### Overall Assessment

**NEEDS REVISION.** The Round 1 architectural warnings and high-risk execution concerns are mostly resolved with concrete, source-grounded gates, and the wave/dependency plan is sound. The two blockers are nevertheless in foundational contracts: restoring a world must not depend on the previous tab's epoch, and every value admitted to the hash/snapshot path must have defined non-finite handling. The router contradiction and broad mutable context should also be corrected during revision so the split remains executable and creates maintainable boundaries.

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

---

## Behavioral Correctness Review (reviewer-correctness-glm-5-3)

### Summary

All 16 Phase 8 plans (`08-01`–`08-16`) are behaviorally faithful to FOUND-10..FOUND-14, the locked CONTEXT decisions (D-01..D-14 including the 2026-11-12 D-06 per-world id amendment), and the five ROADMAP success criteria. Every Round 1 correctness concern I re-checked against live source is genuinely addressed in commit-verified, acceptance-gated plan text (pinned literals confirmed at the cited lines in `src/app/game-session.ts`; RNG arithmetic in `src/sim/math.ts:227-237`; hash composition in `src/sim/flight/state.ts:147-183`; the 39/16 Oolite vocabulary tables; the 14-kind SimEvent union; the 5 `redrawGate.request()` sites). I found no BLOCKER-level contract mismatch. The residual risk sits in a handful of under-specified edge cases at the integration seams — most notably the `pending` command-queue freeze-branch semantics that the sim-driver tests do not fully pin, and a few proven-but-unproven assumptions carried between plans — which are WARNINGs and SUGGESTIONs, not design defects.

### Strengths

- **Round 1 findings are verifiably fixed.** Every disposition-ledger claim I spot-checked against the repository holds: exactly one `case "docked":` (`src/app/game-session.ts:2321`), exactly three `generateMarket(` producers, 77 closure-level `let`s, 9 exports in the facade, `spanY: 2 * chartCamera.spanX` (`game-session.ts:2427`), the renderer's base-then-roll station composition (`src/render/bodies/station.ts:210-215`), and the unconditional `state.tick += 1` before `return events` (`src/sim/flight/step.ts:347,350`).
- **D-08 hash identity is structurally protected**: one exported `isNeverSpawned` predicate (08-05), the serializer forbidden from re-spelling it, worlds seeded for epochs 0–2 all hashed as `hashFlight`, and 08-11's three-way `stepFlight`/`stepSim(undefined)`/`stepSim(emptyWorld)` trace comparison.
- **The D-02 one-way seed derivation is properly gated**: an owner checkpoint (08-02 Task 2) before any code lands, literal vectors from an *independent* scratch re-implementation in the same commit, a durable source-scan guard against new closure-held sim streams, and a cross-check vector quoted in PROJECT.md for Phase 11.
- **Per-world id scope (D-06 as amended 2026-11-12) is enforced end to end**: `createWorld` starts every store at 101, no module-level counter exists, 08-15's lifecycle invariant gate forbids `EntityId` in `world-lifecycle.ts`, and save leakage is checked by the anchored-save describe plus the encoded-save key scan.
- **The split's evidence discipline is strong**: worktree-attributed `verify-full` at steps 3/6/9 with commit+tree SHAs, the pinned-literal audit table before the step-9 gate, the `--repeat-each=3` probe-shape fixture flake check, and the subtractive-diff proof for the one D-13 probe commit.
- **Reserved SimEvent kinds (08-11) cannot break consumers**: the router has no exhaustive `never` check or throwing default (invariant-gated), unknown-kind pass-through is tested (08-10 case (d)), and 08-15 dispatches every `RESERVED_EVENT_KINDS` kind through the real router.
- **Determinism lint (08-03) closes the alias gap** Round 1 flagged (`const m = Math`), bans `globalThis`/timers/`process`/`crypto`, factors the rule lists into spreadable constants for the 08-09 AI zone, and honestly documents the residual laundered-value forms with the behavioral proofs that cover them.
- **Snapshot codec (08-13) is contract-tight**: the `Record<keyof Entity, ...>` field-coverage table makes a field-add a typecheck failure, the sanitizer-parser fast-check property aligns the -0/NaN/Infinity boundary, and the two distinct refusal reasons (`uncommitted`, `queue-not-empty`) are separately tested.
- **08-15 adds the step-cost benchmark** (Round 1's HIGH concern) with a hard bound (1.2× stepFlight + 2 µs), a conditional hash-neutral fast path, and a verify-full wall-time comparison against the split baseline.

### Issues Found

- **Severity**: WARNING
  **Plan/Task**: 08-10 / Task 2 (sim-driver)
  **Description**: The `pending` command queue is cleared in *three* places in the current `frame()` — the not-paused drain (`game-session.ts:2773`), the chart-open freeze branch (2744), and the save-screen freeze branch (2755) — plus the paused branch (2852). Plan 08-10's sim-driver test list pins the drain-once contract for `advanceFrame` (case (e)) but never pins that the chart/save-screen freeze branches (which stay in `frame()` until step 9) still clear `pending`. If the freeze branches' `pending.length = 0` is lost or reordered during the extraction, a launch queued in the frame the chart opens would fire on chart close — a real behavioral change no listed test catches (the probe-shape and e2e specs would not reliably catch it either).
  **Fix**: Add one sim-driver/frame-order test case: with `ctx.chart.chartOpen` true and `pending = [launch]`, one frame clears `pending` and a subsequent frame with the chart closed steps no launch; same for `saveScreenOpen`. Add `pending.length = 0` to the 08-12 pinned-literal/phase-order audit checklist.

- **Severity**: WARNING
  **Plan/Task**: 08-02 / Task 3 (`rng.ts` RangeError contract)
  **Description**: `worldSeedFor`/`forkSeed` throw RangeError for inputs outside `[0, 0xffffffff]`, but the plan never states what happens when `nextId` itself reaches 2^32 (a fork with `entityId = 4294967296` would throw inside a fixed step, killing the frame loop — exactly the DoS class 08-15's T-08-27 guards for marketSeed). It is practically unreachable (the 256-entity cap bounds `nextId` ≈ 357 per world), but the contract is asymmetric: `begin`/`resume` in 08-15 are made non-throwing for non-finite seeds, while the id path has no equivalent guarantee statement.
  **Fix**: One sentence in 08-05 or 08-02 stating the invariant (spawn refuses at `MAX_ENTITIES`, so `entityId < FIRST_DYNAMIC_ID + MAX_ENTITIES + slack` forever, and `forkSeed` can never see an out-of-range id), or a defensive clamp in `spawnEntity`. Optionally a test asserting `nextId < FIRST_DYNAMIC_ID + 2^16` after any spawn/kill/commit sequence in the fast-check property.

- **Severity**: WARNING
  **Plan/Task**: 08-16 / Task 2 (tick parity scope)
  **Description**: The parity proof covers a New-game launch-and-fly script only; the plan's own flagged assumption notes "a jump inside advanceTicks runs the same event path but has no parity fixture in this phase." This means the single most event-heavy transition reachable under `advanceTicks` (a hyperspace jump: world teardown, atomic install block, arrival draw, epoch bump, world recreation) is never exercised through the manual clock in a hash-parity setting. The 08-13 cadence test does cover a jump, but through a hand-rolled lifecycle in the test, not the session's real `worldLifecycle` wiring from 08-15.
  **Fix**: Either promote the flagged assumption to a recorded, accepted gap in PROJECT.md (it currently sits only in the plan's "Flagged assumptions" block and would be easy to lose), or add one Vitest case driving the real driver through a scripted jump (teleport to a mass-lock-free point via the existing hook `setPosition`, `beginHyperspace`, advance through `hyperspaceJumped`) and compare against `runTickScript` with a matching jump script.

- **Severity**: SUGGESTION
  **Plan/Task**: 08-09 / Task 1–2 (test-pilot wake/think interaction)
  **Description**: The pilot schedules a wake of 12–204 ticks (`ticks(0.1 + random()*1.5)`) but thinks every 15 ticks (`nextThinkTick = view.tick + 15`); a wake of 12 fires *before* the next think is due, and the 08-11 wake semantics (`wakeTick > 0 && tick >= ai.wakeTick`, cleared to 0 when due) mean an early wake triggers an extra think, which then re-schedules both timers. The behavior is well-defined by the rules, but no test pins the "wake fires before nextThinkTick" interleaving (the 200-think test uses a fake view advancing by exactly 15, so the two timers never diverge).
  **Fix**: One test-pilot or stepWorld case where the random returns 0 (wake at tick+12) and the view advances by 6, then 6, then 3: assert the think fires on the wake tick, not the think tick, and both timers are re-armed to integers afterwards.

- **Severity**: SUGGESTION
  **Plan/Task**: 08-01 / Task 1 (probe-shape optional-key audit)
  **Description**: The optional-key audit table is required to cover all 21 optional `WegoliteProbe` keys and the acceptance gate greps for each `| <key> |` cell, but the classification itself ("state-determined" vs "timing-dependent") is executor judgment recorded only in comments. `hint` is pre-classified as the sole timing-dependent key; if the executor finds another (e.g., `restore` racing the in-flight Continue), the plan allows adding it to `PROBE_SHAPE_OPTIONAL_KEYS` with a reason row — but there is no second reviewer checkpoint on that judgment, and an over-broad optional list silently weakens the D-13 freeze.
  **Fix**: Require the SUMMARY to list any key *beyond* `hint` that was classified timing-dependent, with the repetition-failure evidence that motivated it, so the phase-level review can audit the classification.

- **Severity**: SUGGESTION
  **Plan/Task**: 08-06 / Task 2 (listener-total gate)
  **Description**: The `addEventListener`/`removeEventListener` totals gate catches count drift but not *pairing* drift (a handler moved from an abort-signal to `window` keeps the count). The plan does require "registration still happens from the same start-up call site," but that part is SUMMARY-recorded, not mechanically gated, and dispose idempotence for the settings/chart listeners is only proven generically in 08-12's "dispose order" test (which uses its own doubles, not the real controllers).
  **Fix**: In the 08-12 dispose-order test, build the real settings and chart controllers (with fake overlays) once so their real listener registrations are covered by the idempotence assertion, or add an explicit assertion that every `addEventListener` site moved in 08-06 has a matching teardown path listed in the recorded teardown order.

- **Severity**: SUGGESTION
  **Plan/Task**: 08-14 / Task 1 (manual-clock chart-freeze interaction)
  **Description**: Under `?test=1&clock=manual`, the frame loop keeps the chart-open and save-screen freeze branches (which set `currentFrame` to an idle frame and request a redraw). If a spec opens the chart while the manual clock is active and then calls `advanceTicks`, the driver's refusal path (chart open → unchanged tick) is unit-proven — good — but the *converse* (chart opened mid-`advanceTicks`, i.e., between steps) relies on the early-stop rule. The behavior "a step that opens the chart stops the loop" is listed in the must-haves truth but the Task 2 behavior list only tests the pause case for the early stop ("A failed arrival that sets paused during the second of five steps"), not the chart case.
  **Fix**: Add the chart-open variant of the early-stop test (a step that opens the chart stops after that step, tick reflects only the completed steps).

### Missing Coverage

- **`pending` cleared by the freeze branches** — the only frame()-side state mutation not pinned by a named test (see first WARNING above).
- **A jump under the manual clock / in the parity fixture** — 08-16's flagged assumption; not promoted to a recorded PROJECT.md gap.
- **`tests/app/dispose.test.ts` line 687 region** — flagged as `parse_partial` in the parent's coverage evidence; 08-12's dispose-order test design assumes the current dispose sequence is correctly understood, so the executor should read that file directly rather than rely on the index (procedural, not a plan defect).
- **Cross-engine (Firefox) world-hash equality** — deliberately scoped out by 08-11 Key Decisions row (f) with the V8-only claim; correctly recorded, but worth restating at `/gsd-verify-work` so nobody later cites 08-16's parity as engine-independent.
- **`advanceTicks` while `mode === "docked"` with a *pending* non-launch command** (e.g., `skipLaunch` pushed at `game-session.ts:2285`) — the docked-step behavior under the manual clock is asserted only for the launch case; a stray `skipLaunch` drained in docked mode is untested (low risk, since the launch filter's sibling logic gates it, but unproven).
- **`probe.sim.entities` when the world exists but the store is at cap / mid-commit** — the doc comment fixes the contract (live non-dead dynamics only); no test pins the value *during* the same tick an entity dies but before commit (the probe publishes per frame, after the step, so this is likely vacuous — the plan should say so).

### Recommendations

1. (High, cheap) Add the two freeze-branch `pending`-clearing test cases to 08-10 Task 2 before execution — this is the only identified path where a correct-looking split could change launch timing with no test failing.
2. (Medium) Record 08-16's jump-parity gap in PROJECT.md Key Decisions (or add the jump parity case), so the assumption survives context resets between now and Phase 11.
3. (Medium) State the `forkSeed`/`nextId` range invariant explicitly in 08-05's ids.ts doc comment alongside the per-world scope text.
4. (Low) Add the wake-before-think and chart-early-stop test cases noted above; both are single-test additions to already-specified describes.
5. (Low) During execution, read `tests/app/dispose.test.ts` directly (index parse gap at line 687) before writing 08-12's dispose-order expectations.

### Overall Assessment

**READY** — with the first WARNING (`pending` freeze-branch clearing in 08-10) recommended as a pre-execution plan edit, since it is a two-line test addition that closes the only realistic untested behavior change in the split. All Round 1 correctness issues are verified fixed against live source; the remaining findings are edge-case hardening within well-designed contracts.

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

---

## Algorithm & Determinism Review (reviewer-algorithm-deepseek-v4-pro)

# Phase 8 — Algorithms, Determinism & Performance Peer Review (Round 2)

**Reviewer:** subagent (independent, read-only). **Scope:** all 16 plans `08-01`..`08-16` in `.planning/phases/08-session-split-and-world-core/`. **Evidence:** plan files at HEAD `83c9b5c` ("docs(08): replan phase 8 incorporating cross-AI review"), the Round 1 review `08-REVIEWS.md` (commit `10b4108`), and live source (`src/sim/math.ts`, `src/sim/hash.ts`, `src/sim/flight/state.ts`, `src/sim/hyperspace/arrival.ts`). Live `src/sim/rng.ts`, `src/sim/ai/`, `src/sim/world/` and `src/app/session/` do **not** exist yet — this phase has not been implemented, so the review is of the plan contracts.

**Round 1 resolution check:** the four Round 1 concerns named in the brief are resolved in `83c9b5c`:

- **RNG (L61/L62 @10b4108):** `08-02` Task 3 now lands `src/sim/rng.ts` and its literal `fmix32/mix32/worldSeedFor/forkSeed` vectors in one commit, expected values from an independent scratch re-implementation, plus a permanent "only serialisable streams in src/sim" source-scan guard. Resolved.
- **Spatial index / Map-order (Pitfall 7, L136):** `08-05` replaces the RESEARCH Pattern 4 lookup `Map` with binary search over the ascending `live` array (`rg "new (Map|Set)"` gate), so no container iteration order can ever decide anything. Stronger than Round 1 asked. Resolved.
- **Hashing (L135 @10b4108, consensus HIGH):** `08-05` introduces one exported `isNeverSpawned` predicate used by the serializer (re-spelled conditions gated out), epoch 0/1/2 worlds, and the spawn-kill-commit boundary case. Resolved.
- **Determinism lint (L87):** `08-03` adds Math-alias/computed-member/`globalThis` bans with positive controls. Resolved. **Hot path (L374):** `08-15` adds the `step-cost` benchmark with a hard bound. Resolved.

I verified the delegation arithmetic is bit-exact: `src/sim/math.ts:227-236` and `rngNext` (RESEARCH Code Example 1) share the identical mulberry32 sequence (`+0x6d2b79f5`, `imul(t^t>>>15, t|1)`, `t ^= t + imul(t^t>>>7, t|61)`, `(t^t>>>14)>>>0 / 2^32`). `fnv1a32`, `canon` (`-0`→`0`, throws on non-finite), `hashFlight`/`serializeFlight` all match the plans' descriptions.

---

### Summary

The 16 plans form a coherent, unusually well-specified deterministic-simulation design: a bit-exact serialisable mulberry32 stream, monotonic per-world entity ids with binary-search lookup (no Map/Set ordering), a composed world hash that is byte-identical to `hashFlight` while no NPC has ever spawned, a strict snapshot codec, and a narrow AI seam. Round 1's determinism, RNG, spatial-index and hashing findings are all addressed with concrete gates. I found **no blockers**; the remaining findings are execution-time pitfalls and forward-looking performance notes, the most material being a latent determinism hole around drawing the *world* stream before the first spawn, and an unconditional per-tick `createWorldView` allocation on the NPC-free hot path.

### Strengths

- **Bit-exact RNG delegation** (`08-02`): `createSeededRandom` re-implemented on `rngNext` inside `math.ts`, `arrival.ts` byte-identical (FIDELITY pin), and the sequence pinned with literal vectors captured *before* the edit. The `mix32` bijection claim is correct — `fmix32` is invertible and `b ↦ (b + 0x9e3779b9)>>>0`, the XOR, and `fmix32` are each bijections, so fixed `a` gives injective `mix32(a, ·)` and vice-versa.
- **Correct withdrawal of FNV-1a seed derivation** (`08-02`, RESEARCH Pattern 6): fork seeds use integer `mix32` per locked D-02, not string FNV-1a; `fnv1a32` remains only as the integrity checksum, cleanly separated from seed mixing. Purpose codes are fixed integers (world 1, ai 2, combat 3), never derived from array order.
- **Deterministic ordering is structural, not just tested** (`08-05`, `08-07`, `08-11`): id-ascending dense array + binary search (no Map/Set), `scan` sorted by `(distance², id)` — a *total* order, so the result is stable under any (even unstable) sort; bare `.sort()` is lint-banned while comparator sort stays legal; `for..in` banned; `Object.keys(...).sort(cmp)` blessed as the positive control.
- **Monotonic never-reused ids** (`08-05`): `nextId` is stored state that only increments; `commit` never recomputes `max(live)+1`; the per-world restart at `FIRST_DYNAMIC_ID=101` is documented in `ids.ts`, enforced by `createWorld`, and gated (`EntityId` scan of `world-lifecycle.ts` must be empty).
- **`isNeverSpawned` as the single D-08 predicate** (`08-05`): serializer may not re-spell the condition; epoch bumps (launch/arrival) proven hash-neutral; a spawn-then-kill-all world correctly *not* never-spawned.
- **Strict boundary parser** (`08-13`): 20+ typed `SnapshotError` reasons, `__proto__`/`Object.create(null)` params, and the `ENTITY_FIELDS` `Record<keyof Entity, …>` table forcing hash↔codec agreement at typecheck.
- **Hot-path cost is a hard gate** (`08-15`): `step-cost` scratch benchmark with `STEP-COST FAIL` exit, plus a conditional hash-neutral fast path, and `verify-full` wall-time comparison against the split baseline.
- **Parity is diagnosable** (`08-16`): shared `runTickScript` with per-tick `trace`, both sides also checked against `hashFlight`, and the "same wrong hash" failure mode explicitly closed.

### Issues Found

- **Severity**: WARNING
  - **Plan/Task**: `08-05` (Task 1 `createWorld`/`world.rng`), `08-11` (Task 2 `aiDropped` section), `08-13` (snapshot `rng` field)
  - **Description**: The world-level stream `world.rng` is initialised at `createWorld` (`createRngState(forkSeed(worldSeed, NO_ENTITY, "world"))`) but is **excluded from the hash and section while `isNeverSpawned` holds**. The invariant that keeps this safe is that the world stream is only drawn *at or after* the first spawn (which flips `isNeverSpawned` in the same tick). Phase 8 is safe only because `populateNothing` never draws. If Phase 12's populator draws `world.rng` and then fails to spawn (or runs with `traffic:false` while still drawing), the stream state diverges **without changing the hash** — a genuine determinism hole. This implicit co-commitment ("draw `world.rng` ⟹ first spawn in the same tick") is nowhere stated or tested.
  - **Fix**: Document the invariant in `world.ts`/`serialize.ts` (world stream draws are co-committed with the first spawn), and add a test asserting that any world whose `world.rng` state advanced but `isNeverSpawned` is still true is either unreachable by construction or reflected in `serializeWorldSection`. Alternatively, include `rng` in the section the moment the stream state differs from its seed value.

- **Severity**: WARNING
  - **Plan/Task**: `08-11` (Task 1 `stepWorld` think phase), `08-15` (Task 3 step 5 fast path)
  - **Description**: `stepWorld`'s think phase unconditionally builds `createWorldView(world, player, layout)` "for the tick", even when the length snapshot `n === 0` (the NPC-free Phase 8 production path for every flight). Each call allocates the view closure plus layout references. The remedy ("build the per-tick WorldView only when an entity with an AI component is due") is gated **behind a benchmark failure** rather than being the default, so the shipped path allocates a view object every tick it will never use. This is precisely the hot-path allocation the focus area flags.
  - **Fix**: Make the lazy construction the default: build the view (and per-actor `createShipControl`) only when `n > 0` and at least one live entity has an AI component whose wake/think is due; keep the benchmark as verification, not as the trigger for the fast path.

- **Severity**: WARNING
  - **Plan/Task**: `08-13` (Task 1 step 2 mismatch reporting)
  - **Description**: The 1,000-tick equality reports "the first diverging id from `entityHashes`" on a `hashWorld` mismatch. `entityHashes` covers only world entities. If the divergence is in the **player** (`serializeFlight(player)`), all per-entity hashes match and the diagnostic reports nothing, misleading the failing test. Since `hashWorld = fnv1a32(serializeFlight(player) + section)`, a player-only drift is the single most likely Phase 8 divergence (the world is NPC-free and empty).
  - **Fix**: On mismatch, also compare `hashFlight(player)` / the `serializeFlight` text of live vs restored before consulting `entityHashes`, and report "player diverged" vs "entity <id> diverged" explicitly.

- **Severity**: WARNING
  - **Plan/Task**: `08-05` (Task 1 `allocate` cap), `08-13` (snapshot `MAX_ENTITIES` check)
  - **Description**: `allocate` refuses "when the count of **non-dead** stored entities is already MAX_ENTITIES", but `live` includes killed-not-yet-committed entities. A naive `live.length >= MAX_ENTITIES` check would refuse spawns prematurely for a world at 256 live + several dead-uncommitted, and (worse) the property test "the live count never exceeds MAX_ENTITIES" must count non-dead, not `live.length`. The spec is correct but the trap is subtle and the words "257th live spawn" could be read either way.
  - **Fix**: In `store.ts` maintain/derive an explicit non-dead count (or count during `allocate`), and make the property test's cap assertion operate on non-dead count; add a dedicated case: 256 non-dead + 3 killed-uncommitted ⇒ spawn still refuses only after a `commit`, then succeeds.

- **Severity**: WARNING
  - **Plan/Task**: `08-13` (world-level fields vs `ENTITY_FIELDS`), `08-05` (`World.rng: RngState`)
  - **Description**: `World.rng` is an `RngState { s }` **object** while per-entity streams are plain `uint32` **numbers** (`EntityStreams { ai, combat }`). The snapshot's `rng` field and `serializeWorldSection`'s `rng=` line must encode the world stream consistently. The `ENTITY_FIELDS` table pins entity fields but the world-level fields only get "the same two checks against `serializeWorldSection`" — the *shape* of `rng` (is it `{s:123}` or `123`?) is left to executor discretion, which is a latent Phase 11 format-contract divergence.
  - **Fix**: Pin the world stream to the same primitive form as entity streams (a plain `uint32` `s` value) in `snapshotWorld`/`serializeWorldSection`, and add an explicit world-level-field row to the codec agreement test asserting `snapshot.rng === world.rng.s`.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-02` (Task 1 step 1)
  - **Description**: The plan states `drawWitchpointExit` "draws nine values". The source (`src/sim/hyperspace/arrival.ts:72-103`) draws **eight** (radial, w, x, y, z, tiltX, tiltY, tiltZ). Harmless (delegation preserves the sequence regardless), but the pinned documentation should be exact.
  - **Fix**: Correct the count to eight in the plan prose and any SUMMARY/comment that repeats it.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-07` (`scan`), forward-looking
  - **Description**: `scan(self, range)` is O(n) per call and the test pilot calls it every think; with n pilots this is O(n²) per think tick. Fine for Phase 8 (0–8 entities; `MAX_ENTITIES=256` keeps even the worst case at ~65k distance² per 15-tick interval), but there is deliberately no spatial index — broadphase is Phase 10. The "spatial index query invariants" in the focus are, in Phase 8, the binary-search id store plus the linear `scan`; no `queryRadius`/`nearest` primitive exists yet, which is correct scope.
  - **Fix**: No action for Phase 8. Note for Phase 10/12 that the copy-on-read `WorldView` contract (fresh vectors/quats) will need a scratch-buffer or results-reuse API if profiling shows allocation pressure, without relaxing the no-reference-leak contract.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-03` (Task 2 alias selectors)
  - **Description**: The Math-alias bans (`VariableDeclarator[init.name="Math"]`, etc.) also reject benign destructuring such as `const { floor } = Math`, forcing `Math.floor(...)` everywhere in `src/sim`. This is a deliberate, documented over-breadth (no current file trips it) but a future contributor may be surprised.
  - **Fix**: Already mitigated by the rule message and the positive-control for direct `Math.floor`; optionally note in the config comment that destructuring is intentionally disallowed to keep the `Math.random` ban visible.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-16` ("Flagged assumptions")
  - **Description**: The browser/Vitest parity fixture covers only a New-game launch-and-fly script; a hyperspace jump inside `advanceTicks` (which draws randomness via `drawWitchpointExit` and re-derives the world from `arrivalMarketSeed`) has no parity fixture this phase. Explicitly acknowledged, so not a defect, but it leaves the arrival stream untested end-to-end in the tick hook.
  - **Fix**: Defer as planned; when the jump parity is added, reuse `recorded-flights.ts`'s Leesti arrival sequence and assert against `hashFlight` too, matching the existing pattern.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-02` (Task 3), assumption A2
  - **Description**: The `mix32` seed tests prove *distinctness* (adjacent ids/purposes, 1,000 epochs) but not stream *independence/quality*. For a game this is sufficient and A2 already records the risk; no blocker.
  - **Fix**: Keep the assumption; optionally add one long-range check (e.g., first 16 draws of fork id 101 vs id 102 have no visible period/lockstep) if cheap, purely as a tripwire.

### Missing Coverage

- **World-stream draw ⟹ first-spawn co-commitment** — the single most important unstated invariant (see WARNING #1). Not covered by any test.
- **Player-divergence isolation in the 1,000-tick reporter** — `entityHashes` alone cannot name a player-side drift (WARNING #3).
- **Non-dead vs `live.length` cap semantics** — the property test asserts a cap but the wording does not force the non-dead interpretation (WARNING #4).
- **World-stream shape (`{s}` vs `s`) in snapshot/hash** — world-level fields are only "same two checks", not a pinned encoding (WARNING #5).
- **`advanceTicks` crossing a hyperspace jump** — no parity fixture (acknowledged in `08-16`).
- **Cross-engine determinism** — correctly deferred (PITFALLS 4, row (f)); the claim is V8-only, which is the right and documented scope.

### Recommendations

1. Default the `stepWorld` empty/`AI-due`-only fast path (do not gate it behind a benchmark failure), then keep the benchmark as verification — eliminates the per-tick `createWorldView` allocation in the NPC-free hot path (WARNING #2).
2. Document and test the world-stream/`isNeverSpawned` co-commitment invariant before Phase 12 introduces a real populator (WARNING #1).
3. Make the equality-test reporter isolate player-vs-entity divergence via `hashFlight`/`serializeFlight` (WARNING #3).
4. Pin the world `rng` snapshot/hash encoding to a plain `uint32` and cover it with a world-level-field codec row (WARNING #5).
5. Clarify the store cap as non-dead-count with an explicit 256-non-dead-plus-dead-uncommitted case (WARNING #4).

### Overall Assessment

**READY** — the plan set is coherent, deterministic-by-construction, and Round 1 is fully absorbed. The five WARNINGs are execution-time pitfalls (not design defects) that the existing gates will catch at build/test time if the executor follows the letter of the plans; the two most valuable to act on before Phase 12 are the world-stream/`isNeverSpawned` invariant and the hot-path view allocation.

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

---

## Adversarial & Trust-Boundary Review (reviewer-adversarial-grok-4-7)

# Adversarial / Trust-Boundary Review — Phase 8 Plans (Round 2)

Read-only review of plans `08-01` through `08-16` as revised by `83c9b5c` (`docs(08): replan phase 8 incorporating cross-AI review`), checked against the live session, probe, purity, and save paths. No Docker gate was run; host Node is not evidence. `tests/meta/sim-purity.test.ts` and `tests/meta/session-size.test.ts` are not in the tree and no plan adds them. The live purity gate is `tests/guards/sim-purity.test.ts`. Graph evidence was taken from the parent Tier-2 bundle; this review confirmed the cited paths by reading source.

### Summary

`83c9b5c` closed the Round 1 items that were actually specified as code: the simple `Math` alias selectors, the single `case "docked":` count, G-8 rebind-after-load, WorldView `copyVec`/`copyQuat`, spawn-time vector copies, the dispose-order Node test, and a large `parseWorldSnapshot` rejection table including a params `__proto__` row. It did not close the trust-boundary holes an executor will now implement on purpose. The probe-shape comparator is specified to treat an empty array as equal to any element set, which blinds the FOUND-10 freeze. The snapshot codec that Phase 11 is told to reuse still accepts non-integer `nextId`, unbounded strings, unknown keys, and shared nested objects after restore. Async teardown (`clearSaveForNewGame`, the autosave completion, `swapSystem`'s untracked frame) is not covered by the new dispose test, and `advanceTicks` never reads `disposed`.

### Strengths

- Round 1's one-way seed pin is now a same-commit literal-vector requirement (`08-02`), and a source scan forbids a second `createSeededRandom(` in `src/sim` outside `math.ts` and `arrival.ts`.
- `08-03` factors `SIM_SYNTAX_BANS` / `SIM_GLOBAL_BANS` / `SIM_RESTRICTED_PROPERTIES` so the AI zone cannot silently drop them, and it probes `const m = Math`, destructuring, computed `Math` members, and `globalThis`.
- `08-01` makes the docked-arm scan file-local and requires exactly one `case "docked":` across session sources, which closes the first-match `switchCaseBody` bypass (`tests/guards/economy-purity.test.ts:201-207`).
- `08-04` / `08-08` / `08-16` keep the hook on the live `FlightState`: rebind after Load is an identity assertion, and `worldHash()` is specified to read `ctx` at call time, with a replacement test.
- `08-05` says `spawnEntity` stores copied vectors; `08-07` requires `copyVec`/`copyQuat` at every view return and a mutation test for position, orientation, and destination; `08-09` passes AI an `EntityId`, not the live `Entity`.
- `08-11` keeps `stepFlight` unchanged, skips the world when it was never spawned, and defines `aiDropped` and repair-versus-normalise so those counters cannot drift silently into the hash.
- `08-13` rejects uncommitted dead entities and a non-empty AI queue as distinct reasons, rebuilds params with `Object.create(null)`, and ties the codec to `keyof Entity` so a new field fails typecheck.
- `08-14` taints before the first `advanceTicks` step, caps `n` at 200_000, and refuses non-integers, pause, and overlays. `08-16` exposes `advanceTicks` only under `?test=1&clock=manual` and does not put the live store on `probe.sim`.
- `08-15` keeps `src/persistence/**` unchanged, calls `begin` before the arrival autosave, and deep-equals `SaveInputs` with and without a live world.

### Issues Found

- **Severity**: BLOCKER
- **Plan/Task**: `08-01` Task 1
- **Description**: The FOUND-10 probe freeze is specified to ignore array drift. `compareProbeShapes` says an empty `"[]"` set on either side matches any element set, and the unit test requires an empty array versus a non-empty string array to report nothing (`08-01-PLAN.md` Task 1 steps 1-2). That contradicts the same step's claim that a new element type is reported. `window.__wegolite` publishes several arrays whose element types are the behaviour under test (`hud.elements`, `hud.contacts`, `bodies`, `hints`). A split that publishes `[]` for a fixture array, or that fills an array the fixture recorded empty, stays green. Preconditions: any later plan moves probe publishing (`08-04`, `08-12`, `08-16`) and the fast gate trusts this comparator. Impact: the safety net every split step gates on cannot see a dropped or invented array payload, so FOUND-10 can pass while the published probe lies.
- **Fix**: Empty matches empty only. A missing or added element shape is a difference in both directions. If one named path is genuinely timing-volatile, add it to an explicit allow-list with a reason, the same way `hint` is the only optional key. Delete the "empty versus non-empty string array reports nothing" case.

- **Severity**: WARNING
- **Plan/Task**: `08-03` Task 2; inherited by `08-09` Task 3 and not re-checked by `08-16`
- **Description**: `83c9b5c` closed `const m = Math` and `globalThis.Math.random()`, then marked T-08-38 mitigated. The selectors do not cover the forms a later sim file can still use: `Reflect.get(Math, "random")()`, `Array.prototype.sort.call(xs)` / `.apply` (callee property is `call`, so `arguments.length=0` on `sort` never matches), and `self.crypto.getRandomValues` (`crypto` is banned as an identifier, `self` is not in `DOM_GLOBALS`, `queueMicrotask` is not banned). The plan only documents "Math passed as an argument" and "a value laundered through another module". `tests/guards/sim-purity.test.ts` is not extended: `declaredFrameTypes` only inspects the next 24 lines and `withoutLineComments` only strips `//` lines (`tests/guards/sim-purity.test.ts:99-125`). Plans `08-04`, `08-06`, and `08-14` tell the executor not to name a type `Frame`, but the gate they run will not notice a `*Frame*` type whose `pitch`/`roll` sit past that window or inside a block comment. There is still no `tests/meta/session-size.test.ts`, so a facade that re-grows past the split is invisible to lint. Preconditions: a contributor (or a later phase) lands one of those forms under `src/sim` or `src/sim/ai`. Impact: FOUND-12's "lint rejects Math.random / bare sort / platform randomness" claim is false for those forms; the 1,000-tick proof does not run on every future file.
- **Fix**: Add probes for `Reflect.get(Math, "random")`, `Array.prototype.sort.call`, `queueMicrotask`, and `self.crypto.getRandomValues`, and either ban them or list them next to T-08-38 as accepted residuals with a behavioural test that fails if they appear under `src/sim`. Widen the Frame scan to the whole type body (brace-matched, block comments stripped), or drop the 24-line window. Do not call the alias gap closed.

- **Severity**: WARNING
- **Plan/Task**: `08-09` Task 3
- **Description**: The AI import zone is two non-recursive globs, `src/sim/ai/*.ts` and `src/sim/ai/pilots/*.ts`. A file at `src/sim/ai/framework/priority.ts` or `src/sim/ai/pilots/roles/trader.ts` still matches `src/sim/**/*.ts`, so the determinism bans apply, but the allow-list does not. It can import `../world/store.js` or `../../flight/step.js` and FOUND-13's lint proof stays green. Separately, the allow-list permits value imports of `world/ids.js` and `math.js`, and nothing seals those modules against `export * from "./store.js"`. The specifier table never imports through a re-export. Preconditions: Phase 14 adds a nested AI file, or a one-line re-export lands in an allowed module. Impact: hand-ported AI can read and write the store while the zone guard reports clean.
- **Fix**: Use recursive globs and a depth-independent check (or one block per real depth), and add a probe at `src/sim/ai/nested/probe.ts` that must fail. Add a guard that the export specifiers of `ids.ts`, `view.ts`, `control.ts`, and `math.ts` do not name store, world, entity, flight, or events modules.

- **Severity**: WARNING
- **Plan/Task**: `08-13` Task 1 and Task 2; consumed by `08-11` serialize and by Phase 11 as specified
- **Description**: T-08-24 calls `parseWorldSnapshot` a strict boundary for untrusted JSON and says Phase 11 reuses it. The rejection list does not match `parseSave` (`src/persistence/save.ts:390-407, 569-578`). Missing checks, each with a reachable input once a snapshot is parsed from a save or a test fixture: `nextId` may be a non-integer or an unsafe integer as long as it is greater than every id (`101.5`, `2**53+3`); position and radius have no magnitude cap (`1e308` is finite, then `canon` throws or the hash string explodes); `specKey`, param strings, and param arrays have no length cap; unknown own keys on the root, entity, nav, and ai objects are not rejected; `__proto__` is rejected only as a params key, not on the root or entity object that an `Object.assign` / spread restore would copy; a params value that is an object or an array of objects is not in the rejection table. `restoreWorld` is specified as "copied entities" but the anti-alias test only mutates the raw input after `parseWorldSnapshot`, not the parsed snapshot after `restoreWorld`. A shallow copy shares `position`, `orientation`, `nav.destination`, and `ai.params` with the caller. Preconditions: Phase 11 feeds a save blob, or any caller mutates the object `restoreWorld` just consumed. Impact: a crafted snapshot becomes live sim state (non-deterministic ids, hash DoS, prototype-key injection) or a later mutation of the parsed object changes the restored world and splits the 1,000-tick proof.
- **Fix**: Reject unless `nextId` is a safe integer `>= 101` and strictly greater than every id; reject unknown keys; cap string and array lengths and position/radius magnitude using the same idea as `MAX_SAVE_CHARS` / `MAX_SAVE_POSITION_MAGNITUDE`; reject `__proto__`, `constructor`, and `prototype` on every object, not only params; reject non-`ParamValue` nested values. `restoreWorld` must deep-copy every nested vector, quat, nav, rng, and params object. Add a test that mutates the parsed snapshot after restore and asserts the live world and `entityHashes` do not change. Keep `restoreWorld` from being a second, unchecked entry point: it should accept only a value `parseWorldSnapshot` just returned, or re-run the same validators.

- **Severity**: WARNING
- **Plan/Task**: `08-08` Task 2, `08-12` Task 2, `08-14` Task 1, `08-15` Task 2
- **Description**: `83c9b5c` added a sync "dispose order" test and an `addEventListener` / `removeEventListener` count. Neither sees the failure paths that already exist in `src/app/game-session.ts` and that the plans move verbatim. `loadFromSave` checks `disposed` only after its one await (`game-session.ts:1341-1344`); the new order test toggles `saveScreenOpen`, not `disposed`, so an executor can drop `disposed ||` and still pass. `clearSaveForNewGame` awaits `store.clear` and then writes `saveStatus` with no `disposed` check (`game-session.ts:1482-1497`). `queueSnapshot`'s completion handler updates save counters and calls `syncSaveProbe` after dispose; only `renderStation` is guarded (`game-session.ts:1167-1197`). `swapSystem` schedules a `requestAnimationFrame` that is not stored in `rafId` (`game-session.ts:3288-3293`), so `dispose`'s `cancelAnimationFrame(rafId)` does not cancel it, and the continuation calls `renderFrame(0)` with no `disposed` check. `advanceTicks` (`08-14`) refuses a missing `state` but never reads `ctx.runtime.disposed`. Dispose sets `disposed = true` before it clears `state` (`game-session.ts:3303-3340`); a hook closure captured before `delete probe.test` can still step mid-teardown. Listener totals are bypassable: a new `addEventListener` without `uiController.signal` plus a matching `removeEventListener` string keeps the counts equal. `08-15` adds `end()` inside dispose and does not say to extend the pinned teardown list, so the idempotence proof will not cover the world drop. Preconditions: F2 Load or New Game, then `pagehide` / `dispose` during the await; a scene swap overlapping dispose (the existing dispose e2e); `advanceTicks` invoked from a closure after dispose starts. Impact: a disposed session still clears or commits IndexedDB, draws a frame, or steps the world; a second `dispose` is idempotent only for the collaborators the Node double recorded.
- **Fix**: After every await in `loadFromSave` and `clearSaveForNewGame`, return before any install or status write if `disposed` is set, and pin that with a recording test. In the autosave completion and the `swapSystem` frame callback, return immediately when `disposed` is set; track that frame id and cancel it from `dispose`. `advanceTicks` must refuse when `disposed` is set, before taint and before drain. Replace the listener-count gate with an assertion that every `addEventListener` in `src/app/session` passes `signal: ctx` abort signal (the two window keydown sites at `game-session.ts:2268` and `2289` are the pattern). Extend the dispose-order list when `08-15` adds `end()`, and assert a second `end()` is a no-op.

- **Severity**: WARNING
- **Plan/Task**: `08-05` Task 1, `08-11` Task 1, `08-16` Task 1
- **Description**: Shared mutable tables are still the world's identity. `STATIC_ENTITIES` is one array assigned into every world (`statics = STATIC_ENTITIES`), described as a "frozen table" with no `Object.freeze`. `restoreWorld` points restored worlds at the same array. A write to `world.statics[0].scanClass` changes every live and restored world, and the snapshot cannot repair it because statics are not serialized. `AI_REGISTRY` is a mutable object typed `Readonly`. `stepWorld` reads `world.store.live` by index, which is correct only while `kill` does not splice before commit; the plan does not say `get` returns the live `Entity` and that no session module may hold that reference. `08-16` counts entities from the live store inside `updateProbe`. If that count is implemented as a filter that returns the array and the publisher assigns it, `window.__wegolite` becomes a mutation handle. The type says `number`, but no test mutates `probe.sim` and asserts the store is unchanged. Preconditions: any session or test code writes a static field, or `updateProbe` leaks `store.live`. Impact: cross-world hash coupling, or a page script under `?test=1` mutating entity position without taint.
- **Fix**: `Object.freeze` the static table and each record, and freeze `AI_REGISTRY`. State that `store.get` / `store.live` are sim-internal and that `src/app` must not import them (a guard, not a comment). In `08-16`, compute `entities` as a number local and add a test that replacing `probe.sim` or writing `probe.sim.entities` does not change `world.store`.

- **Severity**: SUGGESTION
- **Plan/Task**: `08-15` Task 3
- **Description**: The anchored-save check `JSON.stringify(snapshotForSave(inputs))` contains none of `"epoch"`, `"worldSeed"`, `"nextId"`, or `"entities"` is a substring search. A leak under another name passes; an incidental commodity or message containing those letters fails. The deep-equal of `SaveInputs` is the real gate, and only if both sides are built from the field list in `src/persistence`, not from two calls that share a buggy builder.
- **Fix**: Assert `Object.keys` of the encoded save against the v2 allow-list, and assert `buildSnapshotInputs` does not read `worldLifecycle`. Keep the substring check only as a backstop.

- **Severity**: SUGGESTION
- **Plan/Task**: `08-12` Task 1
- **Description**: The monolith has no `setTimeout` / `setInterval` (`rg` over `src/app/game-session.ts` shows only the two `addEventListener` sites). The split plans never forbid a new timer in `src/app/session`, and `dispose` has no timer-id list to clear. A helper added during extraction would survive `uiController.abort()`.
- **Fix**: Gate `rg` for `setTimeout` / `setInterval` / `queueMicrotask` under `src/app/session` at zero, or require each id to be cleared in the recorded teardown list.

### Missing Coverage

- No plan adds `tests/meta/sim-purity.test.ts` or `tests/meta/session-size.test.ts`. The Frame-window and comment-stripping holes in `tests/guards/sim-purity.test.ts` are untested. There is no budget gate that the facade stays a facade after step 9.
- `parseWorldSnapshot` has no fixture for extra keys, unsafe `nextId`, huge `specKey`, nested param objects, `__proto__` on the entity object, or post-restore mutation. Those are the cases `parseSave` already treats as untrusted.
- Dispose coverage does not include dispose during `loadFromSave`, during `clearSaveForNewGame`, during an in-flight `queueAutosave`, or during `swapSystem`'s second frame. `tests/app/dispose.test.ts` (parse gap at the `vi.mock` around line 687) is not extended by these plans.
- `advanceTicks` refusal table omits `disposed === true` and omits a hook closure invoked after `delete probe.test`.
- AI-zone proofs never place a file outside the two globs, and never prove the allowed modules' export surface.
- `08-16` parity does not include a jump inside `advanceTicks` (the plan flags this). A jump is also the path that bumps epoch and replaces the world; a stale `worldHash` closure would only show up there.
- No plan checks that `createTestHook`'s existing mutators (`setPosition`, `setSpeed`, `grantEquipment`) still taint when `advanceTicks` is absent (`?test=1` without `clock=manual`). `08-04` tests `setSpeed`; `08-16` should re-run that after the fifth parameter is added so the new argument cannot shift `onMutate`.

### Recommendations

1. Fix the `08-01` empty-array wildcard before any split step treats the probe-shape spec as evidence. That is the one change that invalidates later gates if left as written.
2. Tighten `parseWorldSnapshot` / `restoreWorld` to the `parseSave` standard (safe integers, magnitude and length caps, unknown-key rejection, deep copy, post-restore alias test) in `08-13`, not in Phase 11. The plan already says Phase 11 reuses this parser.
3. Add the `disposed` short-circuit tests to `08-08`, `08-12`, and `08-14` before the bodies are moved. Verbatim move will otherwise freeze the `clearSaveForNewGame` and `swapSystem` holes.
4. Make the AI zone recursive and seal the allowed modules' exports (`08-09`). Do not treat the `08-03` alias work as a complete determinism lint.
5. Freeze `STATIC_ENTITIES` and `AI_REGISTRY`, and keep `store.live` off the probe (`08-05`, `08-11`, `08-16`).

### Overall Assessment

NEEDS REVISION

The phase is executable after the probe-shape comparator is corrected and the snapshot and dispose gaps above are written into the plans. Round 1's guard, purity, disposal, and save notes were only partly resolved by `83c9b5c`: the simple alias and the Load rebind are specified; the empty-array wildcard, the incomplete snapshot boundary, and the async dispose paths are not. No plan should be treated as READY while the FOUND-10 comparator is defined to ignore array drift.

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

---

## Broad-Context & Blast-Radius Review (reviewer-context-gemini-4-argon)

### Summary

Round 2 broad-context blast-radius and cross-plan review of `08-01-PLAN.md` through `08-16-PLAN.md` confirms that commit `83c9b5c` thoroughly resolved the Round 1 (`08-REVIEWS.md`) findings, with every plan carrying a traced disposition ledger, disjoint same-wave `files_modified` ownership under D-14, and worktree-isolated `verify-full` gates at baseline and split steps 3, 6, and 9. Whole-repository verification against the live codebase (`src/app/game-session.ts`, `src/app/probe.ts`, `src/sim/**`, `eslint.config.js`, and `tests/**`) uncovered no architectural blockers, four concrete cross-module boundary warnings (`__purity_` probe naming vs `tests/compliance.test.ts` and parallel `src/sim` directory walks; unguarded `document`/`window` globals in extracted session controllers tested under Node Vitest; `createEventRouter` wiring in `08-15` where `src/app/game-session.ts` is outside `files_modified`; and `sanitizeEntity` vs `parseWorldSnapshot` numeric domain alignment for `08-13`'s fast-check property), and two minor suggestions.

### Strengths

- **Complete Round 1 resolution (`83c9b5c`):** Every Round 1 concern in `08-REVIEWS.md` is addressed with concrete verification gates: the 21-key optional-probe audit table and `--repeat-each=3` check (`08-01`), same-commit independent scratch vectors and permanent `createSeededRandom` source scan (`08-02`), AST alias/computed-member/`globalThis` bans (`08-03`), closure/factory capture scans (`08-04`, `08-06`), single exported `isNeverSpawned` predicate and read-only `OOLITE_SRC` table verification (`08-05`), `THREE.Quaternion` station-roll parity and `Record<keyof ...>` narrow-seam pins (`08-07`), `loadFromSave` and `handleEvent` call-order characterization tests (`08-08`, `08-10`), `ESLint#calculateConfigForFile` regex allow/reject tables (`08-09`), explicit `sanitizeEntity`/`aiDropped` tables (`08-11`), `Record<keyof Entity, ...>` hash/codec field parity (`08-13`), test-title preservation diffs (`08-14`), `/tmp` hot-path step-cost benchmark (`08-15`), and per-tick trace + `hashFlight` parity checks (`08-16`).
- **Strict wave isolation and zero same-wave file collisions:** Across Waves 1–6, every parallel pair (`08-01`/`08-02`/`08-03`, `08-04`/`08-05`, `08-06`/`08-07`, `08-08`/`08-09`, `08-10`/`08-11`, `08-12`/`08-13`) has completely disjoint `files_modified` sets, respecting D-14's split-track (`src/app/**`) vs core-track (`src/sim/**`, `eslint.config.js`) boundary.
- **Caller blast radius preserved across all public and test seams:**
  - `createGameSession` (`src/app/game-session.ts:335-3365`, imported only by `src/main.ts:33-34`) keeps all 9 exported symbols and its exact 11-method `GameSession` return shape through `08-04`..`08-16`, shrinking `src/app/game-session.ts` from 3,365 lines to ~330 lines (< 600 gate in `08-12`).
  - `createSeededRandom` (`src/sim/math.ts:227-236`) keeps its signature and mulberry32 draw sequence via delegation to `rngNext`, leaving `src/sim/hyperspace/arrival.ts:73` (and its `FIDELITY.md` line pin at `:125`) plus all four render callers (`src/render/bodies/{nebulae,dust,starfield}.ts`, `src/render/break-pattern.ts`) byte-identical.
  - `stepFlight` (`src/sim/flight/step.ts:83-351`), `serializeFlight` (`src/sim/flight/state.ts:147-179`), and `hashFlight` (`src/sim/flight/state.ts:181-183`) remain untouched across all 17 existing `tests/sim/*.test.ts` callers while `stepSim` and `hashWorld` compose cleanly on top of them.
  - `CHANGELOG.md` and `src/persistence/**` are appropriately left untouched in Phase 8 (internal-only refactor and NPC-free foundation; save schema v3 is Phase 11).

### Issues Found

- **Severity**: WARNING
  - **Plan/Task**: `08-03` (Tasks 1–2), `08-09` (Task 3), and `08-02` (Task 3)
  - **Description**: Temporary ESLint probe files written under `src/sim/` by `withSimProbe` (`tests/guards/sim-probe.ts`) in `08-03` (`__ban_for_in.ts`, `__ok_for_of.ts`, etc. at `08-03-PLAN.md:102`) and `08-09` (`08-09-PLAN.md:186`) do not use the `__purity_` filename prefix. In the live codebase, `tests/compliance.test.ts:74` walks the entire repository during `docker compose run --rm test` and only skips `if (entry.name.startsWith("__purity_")) continue;` (as documented in `tests/guards/tools-determinism.test.ts:17-18`). Furthermore, `08-02` Task 3 (`08-02-PLAN.md:201`) adds a recursive `src/sim` file scan in `tests/sim/rng.test.ts` (`describe("only serialisable streams in src/sim")`), and `tests/guards/sim-purity.test.ts:254-292` also walks `src/sim` without `withProbeLock`. During parallel Vitest worker execution (`docker compose run --rm test`), `tests/compliance.test.ts` will either fail the SPDX header check (`tests/compliance.test.ts:259`) on `__ban_*`/`__ok_*` probes or throw `ENOENT` when a probe file or temporary subdirectory (such as `src/sim/world/` in Wave 1 before `08-05` lands) is removed in `finally` between `readdirSync` and `readFileSync`.
  - **Fix**: In `tests/guards/sim-probe.ts` (`08-03` Task 1), normalize every probe filename so its basename starts with `__purity_` (e.g., `__purity_ban_for_in.ts`) and prepend the two-line SPDX header automatically inside `withSimProbe`. In `tests/sim/rng.test.ts` (`08-02` Task 3), skip any file whose name starts with `__purity_` (or run the recursive `src/sim` scan inside `withProbeLock` from `tests/guards/probe-lock.ts`).

- **Severity**: WARNING
  - **Plan/Task**: `08-06` (Task 2), `08-08` (Tasks 1–2), `08-10` (Task 1), `08-12` (Task 1), and `08-15` (Task 3)
  - **Description**: All unit tests run in Node (`vitest.config.ts:73`, `environment: "node"`), where `window` and `document` are `undefined`. In `src/app/game-session.ts`, four places outside `startSession` touch `document` or `window` directly:
    1. `syncHeaderCredits()` (`src/app/game-session.ts:862`) calls `document.querySelector(...)` and is invoked synchronously by `syncStationNav()` (`:871`) <- `renderStation()` (`:976`) <- `stepAmount()`, `confirmTrade()`, `cancelTrade()`, and `commitProfile()`. When `08-08` Task 1 (`08-08-PLAN.md:106`) tests `confirmTrade()` and `cancelTrade()` in Node (`tests/app/session/station-controller.test.ts`), moving `syncHeaderCredits` verbatim will throw `ReferenceError: document is not defined`.
    2. `syncStatusOverlay()` (`src/app/game-session.ts:2161`) calls `document.getElementById("status")` and is invoked directly inside the install block of `handleHyperspaceJumped` (`:2148`). While `08-10` Task 1 only tests a *failed* arrival in Node, `08-15` Task 3 (`08-15-PLAN.md:204`) tests a *successful* `handleHyperspaceJumped` in Node (`tests/app/session/world-lifecycle.test.ts`), which reaches `:2148` and will throw `ReferenceError: document is not defined`.
    3. `closeSaveScreen()` (`src/app/game-session.ts:1906`) calls `document.getElementById("station-screen")`.
    4. `window.addEventListener("keydown", onSubpanelKeyDown, ...)` (`:2268`) and `window.addEventListener("keydown", onLaunchKeyDown, ...)` (`:2289`) currently sit at the top level of `createGameSession` (not inside `startSession`), and `onLaunchKeyDown` (`:2279-2292`) is not explicitly listed in `08-06` or `08-12`'s moved-function lists. Calling `window.addEventListener` inside `createSettingsController` on construction would break `tests/app/session/settings-controller.test.ts` in Node (`08-06-PLAN.md:152`).
  - **Fix**: Guard `document` access in `syncHeaderCredits`, `syncStatusOverlay`, and `closeSaveScreen` with `if (typeof document === "undefined") return;` (or inject a DOM lookup helper via `deps`); keep the `window.addEventListener` registrations out of `createSettingsController` construction (leaving them in `game-session.ts` during `08-06` and moving both `onSubpanelKeyDown` and `onLaunchKeyDown` listener registrations into `start-session.ts` in `08-12`); and explicitly list `onLaunchKeyDown` (`src/app/game-session.ts:2279-2292`) in `08-12` Task 1 (or `08-06` Task 2).

- **Severity**: WARNING
  - **Plan/Task**: `08-10` (Task 2), `08-12` (Task 1), and `08-15` (Task 1)
  - **Description**: `08-10` Task 2 (`08-10-PLAN.md:155`) defines `createEventRouter(subscribers)` taking the subscriber map (`stationFlow`, `hudMessages`, `dockFeedback`, `hyperspaceFlow`), and `08-12` Task 1 (`08-12-PLAN.md:119`) wires all session modules together inside `src/app/game-session.ts`. Then `08-15` Task 1 (`08-15-PLAN.md:130`) adds the 5th subscriber `worldLifecycle` (which needs `ctx.core.marketSeed` and `ctx.core.worldLifecycle`) in `src/app/session/event-router.ts`, but `src/app/game-session.ts` is **not** in `08-15-PLAN.md`'s `files_modified` (`08-15-PLAN.md:7-18`). If `createGameSession` in `src/app/game-session.ts` constructs the subscriber map without passing `ctx` into `event-router.ts`, `08-15` cannot wire `worldLifecycle` into the live session without editing `src/app/game-session.ts` (violating `08-15`'s `files_modified` gate-attribution check).
  - **Fix**: Either have `src/app/session/event-router.ts` in `08-10` accept `ctx` (or export a `createSessionEventRouter(ctx, deps)` factory called by `src/app/game-session.ts`) so `08-15` can wire the `worldLifecycle` subscriber inside `src/app/session/event-router.ts` without touching `src/app/game-session.ts`, or add `src/app/game-session.ts` to `08-15-PLAN.md`'s `files_modified`.

- **Severity**: WARNING
  - **Plan/Task**: `08-11` (Task 2) and `08-13` (Task 2)
  - **Description**: In `08-13` Task 2 (`08-13-PLAN.md:140`), the fast-check property draws per-tick numeric fields (`position`, `destination`, `orientation` components, `speed`, `desiredSpeed`, `desiredRange`, AI timers) from arbitrary `finite values, -0, NaN, Infinity and -Infinity`, runs `sanitizeEntity(entity)`, and asserts `parseWorldSnapshot` never throws. Two edge cases between `08-11`'s `sanitizeEntity` (`08-11-PLAN.md:160`) and `08-13`'s `parseWorldSnapshot` (`08-13-PLAN.md:133`) can cause this property to fail:
    1. When `fc.double()` generates large finite quaternion components (e.g. `1e200`), `w*w + x*x + y*y + z*z` overflows to `Infinity`, and `src/sim/math.ts:54` `normalize(q)` divides `1e200 / Infinity = 0`, producing an all-zero quaternion `{ w: 0, x: 0, y: 0, z: 0 }`.
    2. When `fc.double()` generates negative finite values for `speed`, `desiredSpeed`, or `desiredRange`, `08-11` Task 2 only specifies repairing *non-finite* `speed`/`desiredSpeed`/`desiredRange` to `0`, whereas `08-07` (`control-impl.ts`) and `src/sim/flight/sanitize.ts:96-99` require non-negative speeds/ranges. If `parseWorldSnapshot` rejects negative `speed`/`desiredSpeed`/`desiredRange` or zero-norm quaternions, the fast-check property will fail immediately.
  - **Fix**: In `08-11` Task 2 (`src/sim/world/sanitize.ts`), check `!Number.isFinite(normSq) || !(normSq > 0)` on the quaternion squared norm (matching `src/sim/flight/sanitize.ts:57-59`) to repair overflowed/underflowed quaternions to `identity()`, and repair negative `speed`, `desiredSpeed`, and `desiredRange` (`< 0`) to `0` so `sanitizeEntity` and `parseWorldSnapshot` enforce the exact same numeric domain.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-16` (Task 1 & Task 2)
  - **Description**: In `08-16` Task 1 step 1 (`08-16-PLAN.md:125`), `WegoliteProbe.sim` is optional (`absent on the failure surface and before the session starts`), while step 2 (`08-16-PLAN.md:126`) states `updateProbe publishes probe.sim each frame from ctx: tick = state.tick...`. Because `tests/app/session/probe-publisher.test.ts` (`08-04` Task 2, re-run by `08-16` Task 1's verify command) calls `updateProbe()` on a fresh `createSessionState` where `ctx.core.state` is `undefined`, reading `ctx.core.state.tick` outside the `if (currentState !== undefined)` guard would throw a `TypeError` and would publish `probe.sim` before a session starts. Additionally, `08-16` Task 2 step 3 case (c) (`08-16-PLAN.md:162`, `/?clock=manual&traffic=0`) reads `probe.sim.clock`, `probe.sim.traffic`, and `probe.sim.tick` advancing while docked, which requires calling `startNewGame(page)` first so the session leaves `"menu"` mode.
  - **Fix**: Publish `probe.sim` inside the `if (currentState !== undefined)` block of `updateProbe()` (and `delete probe.sim` in `dispose()` alongside `delete probe.test; delete probe.save; delete probe.saveScreen;` at `src/app/game-session.ts:3342-3344`), add the `| sim |` row to the optional-key audit comment table in `tests/e2e/probe-shape.spec.ts`, and call `startNewGame(page)` in `tests/e2e/tick-hook.spec.ts` case (c) before asserting `probe.sim` fields.

- **Severity**: SUGGESTION
  - **Plan/Task**: `08-05` (frontmatter) and `08-15` (frontmatter)
  - **Description**: `08-05-PLAN.md` (`wave: 2`) lists `depends_on: ["08-02"]` but relies on `08-03`'s determinism lint rules in its Task 2 verify block (`08-05-PLAN.md:195`), and `08-15-PLAN.md` (`wave: 8`) lists `depends_on: ["08-14", "08-11"]` but runs `08-13`'s `tests/sim/world` snapshot suite in Task 3 step 5 (`08-15-PLAN.md:208`).
  - **Fix**: Add `"08-03"` to `08-05-PLAN.md`'s `depends_on` (`["08-02", "08-03"]`) and `"08-13"` to `08-15-PLAN.md`'s `depends_on` (`["08-14", "08-11", "08-13"]`) so the frontmatter dependency graph is complete independently of wave numbers.

### Missing Coverage

- No requirement (`FOUND-10` through `FOUND-14`) or roadmap success criterion (SC1–SC5) lacks automated test coverage. The only uncovered runtime edge cases are the Node-environment `document`/`window` guards in extracted session controllers (`08-06`, `08-08`, `08-15`) and the `__purity_` probe-prefix exclusion in `tests/guards/sim-probe.ts` (`08-03`) when the full Vitest suite runs in parallel.

### Recommendations

1. **Prefix all `withSimProbe` temporary files with `__purity_` and include the SPDX header (`08-03`, `08-09`, `08-02`):** Ensure `withSimProbe` in `tests/guards/sim-probe.ts` automatically prefixes the probe filename with `__purity_` and prepends the two-line GPL-2.0-or-later header, and have `tests/sim/rng.test.ts`'s `src/sim` scan ignore `__purity_*` files so parallel runs with `tests/compliance.test.ts` and `tests/guards/*` never race or fail header checks.
2. **Guard `document`/`window` in extracted session modules (`08-06`, `08-08`, `08-10`, `08-12`, `08-15`):** Add `if (typeof document === "undefined") return;` in `syncHeaderCredits`, `syncStatusOverlay`, and `closeSaveScreen`, keep `window.addEventListener` registrations in the composition root (`game-session.ts` -> `start-session.ts`), and explicitly assign `onLaunchKeyDown` (`src/app/game-session.ts:2279-2292`) in the split plans.
3. **Align `createEventRouter` wiring (`08-10`, `08-15`) and `sanitizeEntity` / `parseWorldSnapshot` domains (`08-11`, `08-13`):** Pass `ctx` into `event-router.ts` in `08-10` (or add `src/app/game-session.ts` to `08-15`'s `files_modified`), and handle quaternion `normSq` overflow/underflow (`!Number.isFinite(normSq) || !(normSq > 0)`) and negative speeds/ranges in `sanitizeEntity` (`08-11`).

### Overall Assessment

READY

*(No blocking defects; the four warnings above are localized guard/wiring precautions that can be applied directly during plan execution or as a small pre-execution polish.)*

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

---

## Fast Triage Review (reviewer-triage-glm-5-3-flash)

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

---

## Consensus Summary

Six independent, source-grounded specialist reviewers (`reviewer-architect-kimi-k3-1-pro` on Kimi K3.1 Pro, `reviewer-correctness-glm-5-3` on GLM-5.3, `reviewer-algorithm-deepseek-v4-pro` on DeepSeek V4 Pro, `reviewer-adversarial-grok-4-7` on Grok 4.7, `reviewer-context-gemini-4-argon` on Gemini 4 Argon, and `reviewer-triage-glm-5-3-flash` on GLM-5.3-Flash) reviewed all 16 Phase 8 plans (`08-01` through `08-16`) against the live repository after Round 1 replanning (`83c9b5c`). The external `claude` CLI lane refused the 152,123-token prompt at its 130,000-token lane cap.

All 6 reviewers confirmed that every Round 1 finding from commit `10b4108` was genuinely addressed in commit `83c9b5c` with concrete plan actions, automated verification checks, and per-plan `Review Dispositions Ledger` tables. Four reviewers returned `READY` (with targeted pre-execution warnings) and two (`reviewer-architect-kimi-k3-1-pro` and `reviewer-adversarial-grok-4-7`) returned `NEEDS REVISION` for 3 specific blocker defects uncovered by cross-plan and trust-boundary analysis.

### Agreed Strengths

- **Complete Round 1 resolution (`83c9b5c`)**: All 6 reviewers independently verified that all 16 Round 1 findings were resolved in executable plan tasks and tests — including pinned `fmix32`/`mix32`/`worldSeedFor`/`forkSeed` literal vectors (`08-02`), AST-based `Math`-alias and determinism lint + negative probe harness (`08-03`), single-predicate `isNeverSpawned` hash identity and binary-search entity store lookup (`08-05`), single `case "docked":` invariant across `src/app` (`08-01`, `08-06`, `08-10`, `08-12`), `loadFromSave` async ordering and hook rebind (`08-08`), pre-launch autosave call-order proofs (`08-10`, `08-14`), and per-tick world step-cost benchmark (`08-15`).
- **Incremental session split with frozen browser contract (D-12, D-13, D-14)**: All 6 reviewers praised the step-0 safety net (`08-01` freezing `window.__wegolite` across all 5 session states and making `redraw-gate`/`economy-purity` scans order- and file-boundary-independent before `08-04` touches `src/app/game-session.ts`), keeping waves 2–6 strictly parallel between `src/app/session/*` and `src/sim/world/*` + `src/sim/ai/*` with disjoint same-wave `files_modified` sets, and postponing the additive probe expansion to a single commit in `08-16`.
- **Bit-exact mulberry32 delegation & 600-tick flight hash pin (`08-02`)**: Verified by `algorithm`, `correctness`, `context`, and `triage` against `src/sim/math.ts:227-236` and `src/sim/hyperspace/arrival.ts:72-104`: delegating `createSeededRandom` to `createRng`/`rngNext` preserves exact draw sequences for `drawWitchpointExit` and all render callers without touching `FIDELITY.md`-pinned modules.
- **Data-oriented AI component and world store isolation (`08-05`, `08-07`, `08-09`, `08-11`, `08-13`)**: Reviewers agreed the pure-data `AiComponent` table, ascending-id `EntityStore` with two-phase `kill`/`commitKills`, read-only `WorldView` defensive copies, and 1,000-tick midpoint snapshot/restore round-trip proof provide a clean foundation for Phases 9–12.

### Agreed Concerns

#### Blockers & Multi-Reviewer Converged Concerns (Highest Priority)

1. **BLOCKER (`08-11` Task 2, `08-13` Tasks 1–2, `08-05` Task 1) — `sanitizeEntity` / `parseWorldSnapshot` numeric domain & quaternion overflow mismatch** *(flagged by `architect` [Blocker 2], `context` [Warning 4], and `adversarial` [Warning 3])*:
   - `serializeEntity` hashes every numeric field via `canon` (`src/sim/hash.ts:29-34`, which throws `Error("Cannot canonise non-finite number")` on `NaN`/`Infinity`), and `snapshotWorld` serializes every field to JSON (where `NaN`/`Infinity` become `null` and fail `parseWorldSnapshot`).
   - However, `sanitizeEntity` (`08-11-PLAN.md:160-165`) only repairs `position`, `orientation`, `destination`, `speed`, `desiredSpeed`, `desiredRange`, and AI timers (`nextThinkTick`, `wakeTick`). It omits `radius`, `ownerId`, `spawnTick`, `repairs`, stream states, and numbers/number-arrays inside `AiComponent.params`.
   - Furthermore, `08-13` Task 2's `fast-check` property draws arbitrary finite doubles (`fc.double()`) and asserts `parseWorldSnapshot(JSON.stringify(snapshotWorld(world)))` never throws after `sanitizeEntity`, yet: (a) for large finite quaternion components (e.g. `1e200`), `w*w + x*x + y*y + z*z` overflows to `Infinity`, so checking only `normSq === 0` produces `{0, 0, 0, 0}` instead of repairing to `identity()` (unlike `src/sim/flight/sanitize.ts:57-59` which checks `!Number.isFinite(normSq) || !(normSq > 0)`), and (b) negative finite `speed`/`desiredSpeed`/`desiredRange` are left negative by `sanitizeEntity` if not clamped to `>= 0`, causing `parseWorldSnapshot` to reject them.
   - **Required fix**: In `08-05` `spawnEntity`, validate constructor-only numeric fields (`radius > 0 && Number.isFinite(radius)`, finite non-negative integer `spawnTick`, valid `ownerId`); in `08-11` `sanitizeEntity`, check `!Number.isFinite(normSq) || !(normSq > 0)` for quaternion normalization, clamp negative `speed`/`desiredSpeed`/`desiredRange` to `0`, and recursively sanitize/fallback numeric leaves and number arrays in `ai.params` (incrementing `repairs`); in `08-13` Tasks 1–2, align `parseWorldSnapshot` bounds with `sanitizeEntity` output and inject non-finite values across all mutable numeric leaves in the `fast-check` generator.

2. **BLOCKER (`08-15` Tasks 2–3, `08-13` Task 3) — Warm in-session `Load` vs cold boot `Continue` epoch divergence** *(flagged by `architect` [Blocker 1] and `triage` [Warning 1])*:
   - Under D-03, Phase 8 saves remain v2-byte-identical and do not persist `epoch` (Phase 11 `SAVE-07` adds `epoch` to the v3 save schema).
   - In `08-15` Task 2, a cold boot `Continue` starts a fresh `createWorldLifecycle` at `epoch = 0`, whereas an in-session `Load` (`loadFromSave`) calls `resume(restored.seed)` (if `inFlight`/`launching`) or `end()` (if `docked`), both of which preserve whatever `epoch` counter had accumulated in the prior session before `Load` was clicked.
   - Consequently, loading the exact same v2 save blob via warm `Load` vs cold `Continue` and then launching produces `epoch = priorEpoch + 1` in the warm path vs `epoch = 1` in the cold path — deriving different `worldSeedFor(marketSeed, epoch)` worlds and publishing different `probe.sim.epoch` values from the same save.
   - **Required fix**: Have `loadFromSave` reset the lifecycle epoch to the Phase 8 save-anchor baseline (`0`) inside the synchronous install block (e.g. a `resetForLoad(mode, marketSeed)` or `reset()` operation on `worldLifecycle` before `resume(restored.seed)` / `end()`, while keeping normal `docked` event handling on `end()` so normal dock->launch still increments `epoch`), document that Phase 11 `SAVE-07` will pass the persisted `save.epoch` into `restore`, and add a unit test in `08-15` proving warm `Load` after `N` launches and cold `Continue` from the same save produce identical `epoch` and `worldSeed` on the next launch.

3. **BLOCKER (`08-01` Task 1) — `compareProbeShapes` wildcard empty-array rule blinds the FOUND-10 probe freeze to dropped or invented array elements** *(flagged by `adversarial` [Blocker 1], related to `correctness` [Suggestion 2])*:
   - `08-01-PLAN.md` Task 1 steps 1–2 specify that `probeShapeOf` collapses non-empty arrays to `{"[]": unionOfElementShapes}` and empty arrays to `{"[]": []}`, and that `compareProbeShapes` treats an empty `"[]"` set on either side as matching any element set.
   - Under that wildcard rule, if any refactor in `08-04` through `08-15` accidentally empties a populated array (`hud.elements`, `hud.contacts`, `bodies`, `station.views`) to `[]` or populates a previously empty array (`hints`) with arbitrary objects, `compareProbeShapes` reports zero diff.
   - **Required fix**: Remove the global "empty `[]` matches any element shape" wildcard from `compareProbeShapes` so empty arrays match empty arrays and populated arrays must match their element shape set; if a specific array path is legitimately empty in one state and populated in another only due to timing, allow-list that exact dot-path in `compareProbeShapes` with an explicit comment. Also verify whether any optional key besides `hint` (e.g. `restore`, `dust`, `world`, `shipVisible` in `src/app/probe.ts:314-338`) changes presence across states and list only verified keys in `OPTIONAL_KEYS`.

4. **HIGH (`08-10` Task 2, `08-12` Task 1, `08-15` Task 1) — `event-router.ts` subscriber count assertion, `ctx` wiring, and `08-15` `files_modified` mismatch** *(flagged by `architect` [Warning 1] and `context` [Warning 3])*:
   - `08-10` Task 2 creates `createEventRouter(deps)` taking only `{ stationFlow, hyperspace, messages }` and tests that each of the 14 existing event kinds has **exactly one** subscriber.
   - `08-15` Task 1 then adds a `worldLifecycle` subscriber to `launched` (after `stationFlow`) and `docked` (after `stationFlow`), which requires access to `ctx.core.worldLifecycle` (or a `worldLifecycle` dep passed from `src/app/game-session.ts`, which is **not** in `08-15`'s `files_modified`) and changes `launched` and `docked` from 1 subscriber to an ordered 2-subscriber fan-out while `08-15` says to preserve `08-10`'s assertions unchanged.
   - **Required fix**: Pass `ctx` (or an optional `worldLifecycle` slot on `ctx.core`) into `createEventRouter` already in `08-10` (or add `src/app/game-session.ts` to `08-15`'s `files_modified`), and in `08-15` update `tests/app/session/event-router.test.ts` to assert an explicit subscriber table where 12 kinds have 1 subscriber and only `launched` and `docked` have the ordered pair `[stationFlow, worldLifecycle]`.

5. **HIGH (`08-02` Task 3, `08-05` Task 1, `08-15` Task 1) — `worldSeedFor` / `forkSeed` uint32 `RangeError` vs `never throws inside a fixed step`** *(flagged by `triage` [Warning 2] and `correctness` [Warning 2])*:
   - `08-02` specifies that `worldSeedFor(marketSeed, epoch)` and `forkSeed(worldSeed, purpose, entityId)` throw `RangeError` if `epoch >= 2^32` or `entityId >= 2^32`.
   - `08-15` Task 1 states `begin`/`resume`/`end` in `world-lifecycle.ts` "never throw inside a fixed step", and `08-05` increments `nextId` monotonically across the life of a world.
   - **Required fix**: Guard `begin` in `world-lifecycle.ts` so `epoch` saturates or refuses before `0xffffffff`, and document/guard in `08-05` that `nextId` is bounded (or refused before `0xffffffff`) so neither `worldSeedFor` nor `forkSeed` can ever throw inside `stepSim`.

6. **HIGH (`08-05` Task 1, `08-11` Task 2, `08-13` Tasks 1–2) — `isNeverSpawned`, `world.rng` serialization shape, and `MAX_ENTITIES` non-dead cap semantics** *(flagged by `algorithm` [Warnings 1, 4, 5] and `triage` [Suggestion 3])*:
   - **World RNG vs `isNeverSpawned`**: `serializeWorldSection(world)` returns `""` whenever `world.store.size === 0 && world.store.peekNextId() === 101`. If any future caller draws from `world.rng` without spawning an entity on the same tick, `world.rng.s` mutates without changing `hashWorld`. State and test the invariant that `world.rng` draws must co-commit with `spawnEntity` (or include `world.rng.s !== world.seed` in the predicate).
   - **Plain `uint32` `rng` encoding**: Pin both `serializeWorldSection` (`rng=<uint32>`) and `WorldSnapshot.rng` (`number`) to the plain `uint32` integer `world.rng.s` (matching `AiComponent.rng: number`) and assert agreement in `08-13`'s codec parity test. Also clarify the contradictory sentence in `08-05` Task 1 step 6 so it unambiguously states `serializeWorldSection` returns `""` when never-spawned and the header+entity lines otherwise.
   - **Non-dead cap check**: Because `store.live` contains killed-but-uncommitted entities (`e.dead === true`) until `commitKills()` at the end of `stepWorld`, `spawnEntity`'s `MAX_ENTITIES = 256` check and `08-13`'s property tests must count non-dead entities (`!e.dead`), not raw `live.length`. Add a unit test in `08-05` with 256 live non-dead entities + 3 killed-uncommitted entities where `kill` frees capacity for an immediate same-tick `spawn`.

#### Single-Specialist Warnings Worth Incorporating Before Execution

7. **WARNING (`08-03` Tasks 1–2, `08-09` Task 3, `08-02` Task 3) — `withSimProbe` temporary file prefix vs `tests/compliance.test.ts` and parallel Vitest `src/sim` scans** *(flagged by `context` [Warning 1] and `adversarial` [Warning 1–2])*:
   - `tests/compliance.test.ts:74` walks the repo during `docker compose run --rm test` and only skips files starting with `__purity_`. Naming temporary files `__ban_*` / `__ok_*` (`08-03-PLAN.md:102`) will fail the SPDX header check (`tests/compliance.test.ts:259`) or race with `ENOENT` across parallel Vitest workers (including `08-02`'s recursive `src/sim` scan in `tests/sim/rng.test.ts`).
   - **Required fix**: Force `withSimProbe` in `tests/guards/sim-probe.ts` to prefix all temporary basenames with `__purity_` and prepend the two-line GPL SPDX header; make `tests/sim/rng.test.ts` skip `__purity_*` files; use recursive globs (`src/sim/ai/**/*.ts`) in `08-09`'s ESLint AI-zone config; and widen `declaredFrameTypes` in `tests/guards/sim-purity.test.ts` beyond its current 24-line window while adding probes/bans for `Reflect.get(Math, "random")`, `Array.prototype.sort.call`, and `queueMicrotask`.

8. **WARNING (`08-06` Task 2, `08-08` Tasks 1–2, `08-10` Task 1, `08-12` Task 1, `08-15` Task 3) — Unguarded `document`/`window` globals in Node Vitest unit tests** *(flagged by `context` [Warning 2])*:
   - Vitest runs under `environment: "node"` (`vitest.config.ts:6`). `syncHeaderCredits` (`src/app/game-session.ts:862`, called via `renderStation()` during `confirmTrade()`/`cancelTrade()`), `syncStatusOverlay` (`:2161`, called inside `handleHyperspaceJumped` at `:2148`), and `closeSaveScreen` (`:1906`) call `document.querySelector`/`document.getElementById`/`document.activeElement` without a `typeof document !== "undefined"` guard (unlike line 825 which already guards `typeof document !== "undefined"`). Similarly, `window.addEventListener` for `onSubpanelKeyDown` (`:2268`) and `onLaunchKeyDown` (`:2289`) run at session construction time, and `onLaunchKeyDown` was omitted from the explicit function inventories of `08-06` and `08-12`.
   - **Required fix**: Guard `typeof document !== "undefined"` in `syncHeaderCredits`, `syncStatusOverlay`, and `closeSaveScreen`; keep `window.addEventListener`/`removeEventListener` registration in the composition root (`game-session.ts` -> `start-session.ts`); and list `onLaunchKeyDown` explicitly in `08-06`/`08-12`.

9. **WARNING (`08-13` Tasks 1–2, `08-08` Task 2, `08-12` Task 2, `08-14` Task 1, `08-15` Task 2, `08-05` Task 1, `08-16` Task 1) — Snapshot parser hardening, post-`dispose` async guards, and static/probe immutability** *(flagged by `adversarial` [Warnings 3, 4, 5])*:
   - **`parseWorldSnapshot` & `restoreWorld` (`08-13`)**: Require `Number.isSafeInteger(nextId) && nextId >= 101`, cap string/array lengths and position/radius magnitudes, reject unknown keys and `__proto__`/`constructor`/`prototype` across all nested objects (matching `src/persistence/schema.ts`), reject nested objects inside `AiComponent.params`, and deep-copy all nested objects in `restoreWorld` (verified by mutating the snapshot object after `restoreWorld`).
   - **Post-`dispose()` async & hook guards (`08-08`, `08-12`, `08-14`, `08-15`)**: Check `if (ctx.runtime.disposed) return;` after `await` in `clearSaveForNewGame` and `queueSnapshot`, track or guard `swapSystem`'s `requestAnimationFrame` callback against `disposed`, refuse `advanceTicks` when `ctx.runtime.disposed === true`, and include `worldLifecycle.end()` in `08-15`'s dispose-order test.
   - **Immutability (`08-05`, `08-11`, `08-16`)**: `Object.freeze` `STATIC_ENTITIES` (and each static entity record + vectors) and `AI_REGISTRY`, and verify in `08-16` that mutating `window.__wegolite.sim` does not mutate `world.store`.

10. **WARNING (`08-10` Task 2, `08-11` Task 1, `08-13` Task 1, `08-16` Tasks 1–2) — Freeze-branch `pending` clear test, default lazy `WorldView`, player-first mismatch reporting, and `probe.sim` menu-mode guard** *(flagged by `correctness` [Warnings 1, 3], `algorithm` [Warnings 2, 3], and `context` [Suggestions 1, 2])*:
    - Add a unit test in `08-10` asserting `pending` is cleared when `chartOpen` or `saveScreenOpen` is true (`src/app/game-session.ts:2744,2755`) and add `pending.length = 0` to `08-12`'s pinned-literal audit table.
    - Make lazy `createWorldView` construction in `stepWorld` (`08-11` Task 1 — allocate view only when `n > 0` and at least one AI entity has a wake or think due on that tick) the default implementation rather than waiting for `08-15`'s benchmark to fail.
    - In `08-13` Task 1's 1,000-tick mismatch reporter, check `hashFlight(playerA) !== hashFlight(playerB)` first and report the first differing `serializeFlight` line before checking `entityHashes`.
    - In `08-16`, publish `probe.sim` inside `if (currentState !== undefined)` in `updateProbe()` (so `menu` state has no `sim` key and `08-04`'s `probe-publisher.test.ts` does not crash when `ctx.core.state === undefined`), add `| sim |` to `probe-shape.spec.ts`'s audit table, call `startNewGame(page)` in `tick-hook.spec.ts` case (c), and add `"08-03"` to `08-05` `depends_on` and `"08-13"` to `08-15` `depends_on`.

### Divergent Views

- **Narrow per-controller TypeScript `Pick<SessionState, ...>` facets (`architect` Suggestion 1) vs shared `SessionState` bag (D-12)**: `reviewer-architect-kimi-k3-1-pro` suggested narrowing each controller's parameter type to a per-controller `Pick` facet to prevent cross-sub-bag coupling, whereas `08-CONTEXT.md` D-12 explicitly chose a single typed `SessionState` bag grouped into 6 sub-bags (`core`, `station`, `chart`, `flightUi`, `Save`, `runtime`) to avoid getter/setter ceremony during the mechanical split. **Resolution**: Keep the D-12 `SessionState` bag for Phase 8 so the 5-commit mechanical extraction stays low-risk; optional read-only type aliases can be considered post-split without changing runtime shapes.
- **Handling of `world.rng` draws prior to first spawn (`algorithm` Warning 1)**: `reviewer-algorithm-deepseek-v4-pro` noted two options for closing the gap between `world.rng` draws and `isNeverSpawned`: either enforce that `world.rng` is never drawn without spawning an entity in the same step, or include `world.rng.s !== world.seed` in the `isNeverSpawned` predicate. **Resolution**: Both are compatible with D-08 (since Phase 8's `populateNothing` neither draws `world.rng` nor spawns entities); documenting the co-commitment rule and checking `world.rng.s === world.seed` in `isNeverSpawned` closes the hole cleanly without affecting NPC-free hash identity.
