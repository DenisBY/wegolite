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
