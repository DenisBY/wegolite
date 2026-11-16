---
phase: 14-npc-flight-and-steering-fidelity-gate
verified: 2026-11-16T03:00:00Z
status: passed
score: 5/5 must-haves verified (criterion 4 ratified by the owner on 2026-11-16; see 14-UAT.md)
covered_files:
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-01-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-01-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-02-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-02-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-03-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-03-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-04-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-04-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-05-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-05-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-06-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-06-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-07-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-07-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-08-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-08-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-09-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-09-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-10-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-10-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-11-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-11-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-12-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-12-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-13-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-13-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-14-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-14-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-15-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-15-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-16-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-16-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-17-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-17-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-18-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-18-SUMMARY.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-19-PLAN.md
  - .planning/phases/14-npc-flight-and-steering-fidelity-gate/14-19-SUMMARY.md
  - compose.yaml
  - src/sim/ai/pilots/flight-script.ts
  - src/sim/ai/test-spawn.ts
  - src/sim/npc/dispatch.ts
  - src/sim/npc/flight.ts
  - src/sim/npc/track.ts
  - tests/acceptance/detectors.ts
  - tests/acceptance/thresholds.ts
  - tests/e2e/npc-flight.spec.ts
  - tests/sim/npc/npc-cadence.test.ts
  - tools/ai-harness/dist-check.ts
  - tools/ai-harness/host.ts
covered_digest: "v4:sha256:cfd42ffb5be9ec89b9a84a9192ae075bbe04a570e31e995f019249f58e3ce0a6"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Owner ratifies or overturns the two panel-answered checkpoints: plan 14-17 (acceptance result, option-continue) and plan 14-19 (report accepted; oracle = dev-only differential harness with source-cited traces as per-role fallback; OOLITE_SRC mount kept; IN-02 and IN-04 stay todos)"
    expected: "The owner reads 14-FIDELITY-REPORT.md (or accepts it on the panel's advice) and confirms the PROJECT.md row 'Phase 14 oracle choice for the AI port'. Ratified: the row's outcome is upgraded from 'panel decision on delegation' to an owner decision, status becomes passed. Overturned: the gaps the owner names become gap-closure plans of Phase 14 and T-14-34 reopens."
    why_human: "ROADMAP criterion 4 says 'The owner selects the oracle ... planned only after the owner accepts the report'. Plan 14-19's own prohibition says the choice must never be made by an agent or auto-advance. It was made by a three-model panel (Fable, Opus, Sonnet) on an in-session delegation that 14-SECURITY.md itself says the security auditor 'could not independently verify ... from agent-written text'. The criterion is met by delegation, not as written."
  - test: "Owner resolves or waives .planning/WINDOWS.md entry 3 (vacuous stage-A assertion at tests/acceptance/detectors.test.ts:164-177)"
    expected: "Either option (c) with a commit carrying the Detector-change-approved-by-owner trailer (and a full 20-epoch rerun per thresholds.ts), or an explicit waiver. The entry is open and blocks /gsd-ship."
    why_human: "The harness is frozen by design; only the owner can unfreeze it. The detector code itself (detectors.ts:213) does use collisionRadius; only the test's assertion (typeof result === 'boolean') is vacuous."
  - test: "Owner triages the 14-REVIEW.md findings (0 critical, 4 warning WR-01..WR-04, 6 info IN-01..IN-06), all 'open' in 14-REVIEW-DISPOSITION.md"
    expected: "Each finding fixed, deferred or waived; none is a phase-goal blocker"
    why_human: "Disposition is advisory and owner-owned; none was triaged during the unattended run."
gaps: []
deferred: []
---

# Phase 14: NPC Flight and Steering Fidelity Gate Verification Report

**Phase Goal:** NPC ships fly with Oolite's NPC flight model and native steering behaviours, proven against source-derived oracles, and a bounded spike settles how the differential harness will check the priority-AI port; the larger AI port starts only when the owner accepts the result.
**Verified:** 2026-11-16
**Status:** human_needed
**Re-verification:** No, initial verification

## Verdict in one paragraph

The engineering goal is achieved in the codebase: the flight model and all nine behaviours exist as real ported code, 139 independently authored fixtures (1,015 checks, counted from the files) are wired to port tests, the acceptance thresholds were committed before the port and never edited, the dev-only harness exists and is excluded from `dist` by a gate in `verify`, `verify-full` and the Pages build, and the browser/cadence evidence exists. The one part of the goal that is not met as written is the owner's own acceptance: "the larger AI port starts only when the owner accepts the result" and "the owner selects the oracle" were answered by a review panel on a delegation. That is a human-ratification item, not an engineering gap, so the verdict is `human_needed` and not `passed`. It is also not `gaps_found`: no truth failed.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | NPC ships use Oolite's flight model with record-derived speed, thrust, roll, pitch; nine behaviours pass independent, source-cited oracle fixtures with tolerances, horizons and a frame-rate rule; AI-12 behaviours not built | VERIFIED | `src/sim/npc/` is 4,522 lines: `dispatch.ts` (166) imports and routes attack, attack-close, attack-evade, avoid-collision, evasive, face-destination, flee, formation, fly-to-destination, idle, intercept, tumble; `flight.ts`, `track.ts`, `tracking-curve.ts`, `proximity.ts`, `escort.ts` are substantive. `src/content/schemas/ship-npc.ts` carries `maxFlightSpeed`, `maxFlightRoll`, `maxFlightPitch`, `thrust` and `ships-npc.json` has 9 records with them. Oracle trees: I counted the fixture JSON files and got 139 fixtures and 1,015 checks (matches the report). `tests/oracles/npc/frame-rate-rule.json` exists; its tolerance commit `ae0f4c9` precedes the rate fixtures. Oracle commit history for `tests/oracles` is exclusively plans 14-01, 14-02, 14-06 (no 14-09..14-15 commit touches it), so the oracle tree was not edited by the porter plans. `tests/sim/npc/oracle-coverage.test.ts` ties manifest, fixtures and test files together. `tests/guards/oracle-independence.test.ts` (commit `5a5dc44`) mechanically bars `src` imports from `tests/oracles`. Independence of authorship ("separate agent") is a process claim, backed by the commit separation, not provable from the repo; the report states the shared-source limit honestly. |
| 2 | 20-seed acceptance run passes against thresholds stated before the run: no stuck ship, no tunnelling, no NaN repair | VERIFIED (with stated residuals) | `tests/acceptance/thresholds.ts` has exactly one commit (`b33e72f`, plan 14-07, 2026-11-15; `git log` shows it is older than every `src/sim/npc` commit, the first being `36d1abd` (plan 14-08) and the first behaviour code `74ab664` (plan 14-09)). Harness `detectors.ts`/`detectors.test.ts`/`npc-flight.acceptance.ts` is the single commit `ab7343b`. `accepted-crossings.ts` is an empty frozen array, so nothing was excused. `npc-flight.acceptance.ts` is a 3-import, 1-statement registration. Run result 21/21 is from the summaries (not re-run; tests not run per instruction). Residuals are real and recorded: no head-on closure, near-identical geometry across seeds, several zero counts are near-certain by design. These weaken the evidence for tunnelling but do not contradict the criterion as stated. |
| 3 | With traffic opted in, scripted flyers fly to the station, intercept and flee, are drawn within 50 draw calls, shown on the scanner; hash-identical at 30/60/144 Hz | VERIFIED | `src/sim/ai/test-spawn.ts` (`spawnTestFlyers`) and `src/sim/ai/pilots/flight-script.ts` exist and are used by `tests/e2e/npc-flight.spec.ts`, `tests/sim/npc/npc-cadence.test.ts` (cadences `[30, 60, 144]`, compares the tick-indexed `hashWorld` log) and the acceptance harness. Browser result (hash equals Node replay at tick 1,801, scanner count equals HUD model, remote Chromium at `d8b4483`) is from SUMMARY/report, not re-run. The spec's own comment concedes the draw-call check is weak (about 17 calls); the hash equality carries it. Scope note honoured: normal-play ships stay inert. |
| 4 | Dev-only AI-harness spike in Node against a stub host, `dist` asserted free of it; fidelity report lists each behaviour vs its oracle and the spike outcome; the owner selects the oracle and accepts the report; the choice is a Key Decision | VERIFIED for everything except owner action; HUMAN for the owner clause | `tools/ai-harness/{host,load,dist-check,spike.test,dist-check.test}.ts` exist; `14-SPIKE.md` (positive outcome) exists. `compose.yaml` lines 117 and 137 run `npm run check:dist` after `build:e2e` in both `verify` and `verify-full`; `.github/workflows/pages.yml:37` runs it after the production build. `14-FIDELITY-REPORT.md` has the per-behaviour table (9 behaviours plus flight model), the frame-rate outcome, the acceptance result, the spike and the independence limit. PROJECT.md row "Phase 14 oracle choice for the AI port" exists (line 291), cites the report, and states in bold that it is a panel decision on delegation. See "Owner-ratification question" below. |
| 5 | At least 90 % of new behavioural assertions are Vitest; any browser spec opt-in with traffic off by default | VERIFIED | One new browser spec (`tests/e2e/npc-flight.spec.ts`), opts in with `?test=1&traffic=1&clock=manual`. Reported share 1,969 / 1,990 = 0.9894; the report itself says the metric (added `expect(` lines) is met easily and says little. Not re-measured; accepted as an arithmetic claim with that caveat. |

**Score:** 5/5 truths verified on the engineering evidence; criterion 4's owner clause carries the human item. `behavior_unverified` is 0: the behaviour-dependent truths (cancellation of the AI, the tick timers, the evasive hand-over) are covered by named Vitest scenarios, with the exceptions listed under "Coverage the oracle does not give".

### Owner-ratification question (the one that decides the status)

The task asks whether "the owner selects the oracle" is met as written, met by delegation, or human_needed.

- **As written: not met.** The ROADMAP text and plan 14-19's own must-have and prohibition require the owner's decision at a `blocking-human` checkpoint with no auto-select. Both checkpoints (14-17 and 14-19) were answered by an AI panel.
- **By delegation: arguably met, but unverifiable.** The only evidence of the delegation is the quoted owner messages inside `14-SECURITY.md` ("can you ask Fable instead of me? I don't understand what's in 14-19" and "can you ask several models for confidence"), written by the orchestrator. The security auditor states it could not verify this from agent-written text. "Ask Fable instead of me" is an invitation for advice and could be read narrower than "decide for me and mark requirements complete".
- **Consequence for state.** AI-01, WORLD-07 and AI-11 were ticked complete in REQUIREMENTS.md on the panel's acceptance; ROADMAP Phase 14 still shows `[ ]`. Everything built on the decision is reversible and nothing is built on it yet (the priority-AI phase is unplanned). Every document records the panel nature honestly, which is why I treat this as ratification-pending rather than a failure.
- **Verdict: `human_needed`.** If the owner ratifies, the status is `passed`. A panel of the same model family reading the same report does not add independence from the author's evidence; its value is a second reading, not authority.

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/sim/npc/dispatch.ts` and 20 sibling files | VERIFIED | Substantive, wired into `src/sim/world/step.ts` via steering (contract and imports read); no `TBD/FIXME/XXX` in `src/sim/npc`, `src/sim/ai`, `tests/sim/npc`, `tests/oracles`, `tests/acceptance`, `tools/ai-harness` |
| `tests/oracles/npc/**` | VERIFIED | 139 fixtures / 1,015 checks counted; schema, reference, self-tests, frame-rate rule present |
| `tests/acceptance/{thresholds,detectors,detectors.test,npc-flight.acceptance,accepted-crossings}.ts`, `vitest.acceptance.config.ts` | VERIFIED | Freeze history confirmed from git (thresholds one commit, harness one commit, crossings list empty) |
| `tools/ai-harness/*`, `14-SPIKE.md` | VERIFIED | Present; run in `node:vm`; excluded from `dist` by `check:dist` |
| `src/content/schemas/ship-npc.ts`, `src/content/generated/ships-npc.json` | VERIFIED | Flight fields present on the 9 NPC records |
| `14-FIDELITY-REPORT.md`, PROJECT.md decision rows, FIDELITY.md E-57..E-70 | VERIFIED (exist, consistent with counted evidence) | Report numbers I could recompute (139 / 1,015; thresholds single commit; empty crossings list; `check:dist` wiring) match |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| `compose.yaml` verify and verify-full | `tools/ai-harness/dist-check.ts` | WIRED | lines 117, 137 |
| `.github/workflows/pages.yml` | `check:dist` | WIRED | line 37 |
| `acceptance.ts` -> `detectors.ts` -> `thresholds.ts`, `accepted-crossings.ts` | WIRED | Registration file is the pinned three-import form |
| `tests/guards/oracle-independence.test.ts` -> `tests/oracles` | WIRED | commit `5a5dc44` |
| `steerShip` -> behaviours | WIRED | dispatch imports every in-scope behaviour; out-of-scope ids route to the idle fallback by design |
| `src/sim` -> Three.js/DOM | CLEAN | `rg` for `three` imports and `document.`/`window.`/`navigator.` in `src/sim` returns nothing |

### Data-Flow Trace (Level 4)

Not a rendering phase for its core. For the browser smoke, the data source is the real tick script and world hash (spec compares browser hash to a Node replay), so the flow is genuine rather than hardcoded.

### Behavioral Spot-Checks

Skipped by instruction (tests run in Docker/remote only). Evidence carried from SUMMARYs and the report and labelled as such: full suite 203 files / 4,997 passed, remote `verify` exit 0 at `7fbd649`, `verify-full` exit 0 at `d8b4483`, acceptance 21/21 at `ab7343b`. Items I verified by reading files and git history instead: fixture counts, threshold single-commit freeze, oracle-tree isolation from porter plans, no Three.js/DOM in `src/sim`, `check:dist` wiring.

### Probe Execution

No `probe-*.sh` declared by this phase. SKIPPED.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| AI-01 | 14-01..14-16 (frontmatter), 14-19 | NPC flight model and nine native behaviours | SATISFIED | Truth 1, 2 |
| WORLD-07 | 14-16, 14-18 (staged: drawn and on scanner shipped Phase 12) | NPC ships flying, drawn within budget, on the scanner | SATISFIED (through the `?test=1` hook, as the scope note says) | Truth 3 |
| AI-11 | 14-04, 14-07, 14-19 | Dev-only spike, absent from `dist`, fidelity report, owner's oracle choice recorded as Key Decision | SATISFIED on evidence; the owner-choice half rests on a panel decision pending ratification | Truth 4; human item 1 |

All three phase IDs appear in REQUIREMENTS.md (lines 28-30, traceability 147-149, marked Complete) and in plan frontmatter. No orphaned requirement: REQUIREMENTS.md maps no other ID to Phase 14. Note REQUIREMENTS.md already shows AI-11 and the others as `[x] Complete`, set by plan 14-19 on the panel's acceptance, ahead of the owner.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `tests/acceptance/detectors.test.ts` | 164-177 | `expect(typeof result).toBe("boolean")` is vacuous: the test "uses the collision radius for stage A" cannot fail on a wrong radius | WARNING | WINDOWS.md entry 3, open, blocks `/gsd-ship`. The detector code (`detectors.ts:213`, `hull.collisionRadius`) is correct on reading, so the acceptance result is not undermined, but the regression guard for that line is missing. Fix needs owner option (c) |
| 14-REVIEW.md WR-01..WR-04 | various | missing finite/positive guard in `massFor`; `statsFor` does not validate `forwardWeapon`; loader has no checksum on `OOLITE_SRC` (dev-only); schema accepts speed 0 that the runtime bounds reject | WARNING | All open; none breaks a criterion on stock data. WR-04 (schema accepts a value the runtime bounds reject) is a latent build-time inconsistency |
| 14-REVIEW.md IN-04 | | the 20-seed acceptance run is in no gate (`verify`/`verify-full`) | INFO | By design in the plan (criterion 2 asks for a run, not a gate), but regression in steering would not be caught by CI beyond the oracle tests |

No `TBD`, `FIXME` or `XXX` debt markers in the files scanned. No blocker anti-patterns.

### Human Verification Required

1. **Owner ratification of the panel decisions (decides the status).** Test: read `14-FIDELITY-REPORT.md` (summary, "Owner decision", "Open items") and the PROJECT.md row "Phase 14 oracle choice for the AI port"; confirm or overturn A (report accepted), B (differential harness oracle, traces as fallback), C (keep `OOLITE_SRC` mount), D (IN-02 and IN-04 stay todos), plus the plan 14-17 acceptance `option-continue`. Expected: ratified, so the Key Decision becomes an owner decision and the priority-AI phase may be planned; or overturned, so gaps become gap-closure plans. Why human: ROADMAP criterion 4 and plan 14-19's prohibition reserve this to the owner.
2. **WINDOWS.md entry 3.** Owner chooses option (c) (trailer commit and full 20-epoch rerun) or waives.
3. **14-REVIEW findings.** Owner triages the four warnings and six info items.

### Coverage the oracle does not give (carried from the report, confirmed as stated limits)

- Evasive 0.5 s hand-over: unit tests and mutations only (oracle horizon is one tick).
- Tracking-curve restart on resume: unit tests only.
- Multi-ship interaction: world cases and the acceptance run only.
- Shared-source limit: oracle and port both read pinned Oolite `7437f22`, so a shared misreading passes every fixture. The AI harness is the first independent check, and only for the AILib JavaScript, not for the Objective-C steering.

These are honest residuals, not failed truths, and the report states each.

### Gaps Summary

No failed truths and no blocking gap. The phase's engineering deliverables are present, wired and consistent with the history I could check without running tests. Status is `human_needed` because the criterion that the owner accepts the report and selects the oracle was satisfied by a panel on delegation; owner ratification (or overturn) is the only item that can move this to `passed`. WINDOWS.md entry 3 independently blocks `/gsd-ship` until resolved or waived.

---

_Verified: 2026-11-16_
_Verifier: Claude (gsd-verifier)_
