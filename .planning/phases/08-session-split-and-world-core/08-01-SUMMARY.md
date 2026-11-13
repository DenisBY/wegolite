---
phase: 08-session-split-and-world-core
plan: 01
subsystem: testing
tags: [playwright, vitest, probe-shape, source-scan, session-split, safety-net]

requires:
  - phase: 07-engine-and-release-gates
    provides: window.__wegolite probe, the fast and full verify gates, the two session source scans
provides:
  - tests/fixtures/probe-shape.json, the six-state frozen shape of window.__wegolite recorded from the unmodified monolith
  - tests/e2e/probe-shape.spec.ts, the browser gate with an env-gated write mode, wired into test:e2e:fast
  - tests/e2e/helpers/probe-shape.ts, a self-contained shape encoder and a strict comparator (no empty-array wildcard)
  - tests/helpers/session-source.ts, the location-independent reader of the facade plus src/app/session/**
  - a recorded verify-full baseline of the phase base (red on two stale assertions, see Split baseline)
affects: [08-02, 08-03, 08-04, 08-14, 08-15, 08-16]

actuals:
  tokens: 16150
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "shape-not-value probe pin: the shape is computed inside the page from the serialised encoder source, so functions never have to cross the page boundary"
    - "wait on probe keys (dotted paths, trailing [] for non-empty lists), never on wall time"
    - "source scans read a code-unit-ordered concatenation; order-sensitive comparisons are made over sorted sets"

key-files:
  created:
    - tests/e2e/helpers/probe-shape.ts
    - tests/e2e/probe-shape.spec.ts
    - tests/fixtures/probe-shape.json
    - tests/app/probe-shape-compare.test.ts
    - tests/helpers/session-source.ts
    - tests/app/session-source.test.ts
  modified:
    - package.json
    - tests/contract/container-contract.test.ts
    - tests/app/redraw-gate.test.ts
    - tests/guards/economy-purity.test.ts

key-decisions:
  - "PROBE_SHAPE_OPTIONAL_KEYS stays [\"hint\"]: the optional-key audit confirmed no other timing-dependent key, and PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS stays empty"
  - "Nested state-determined members (save.notice, hud.hyperspaceTarget, economy.marketSystemId, hud.elements, bodies, economy.market, and in flight hud.contacts and hints) are waited for in the state predicates rather than made optional"
  - "The baseline is recorded as measured (red on two pre-existing stale assertions) rather than being made green by editing specs outside this plan's files"

patterns-established:
  - "Write mode (WEGOLITE_PROBE_SHAPE_WRITE=1) records the fixture; only 08-01 and the deliberate post-split commit in 08-16 may run it"

requirements-completed: [FOUND-10]

coverage:
  - id: D1
    description: "window.__wegolite key set and leaf types pinned in six states (menu, docked, paused, chart, inFlight, docked under ?test=1) and re-checked by the fast gate"
    requirement: FOUND-10
    verification:
      - kind: e2e
        ref: "tests/e2e/probe-shape.spec.ts (npx playwright test --repeat-each=3: 18 passed, run in a detached worktree of 1d18e62)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The shape comparator reports added, removed and renamed keys, changed leaf types, null versus object, function leaf changed to a value, null versus missing, and empty versus non-empty arrays in both directions; only hint may be one-sided"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/probe-shape-compare.test.ts (18 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "redraw-gate and economy-purity read every session source through the helper, order-independently, green on the monolith with every count, literal and regex unchanged; the helper is non-vacuous and order-stable"
    requirement: FOUND-10
    verification:
      - kind: unit
        ref: "tests/app/session-source.test.ts, tests/app/redraw-gate.test.ts, tests/guards/economy-purity.test.ts (32 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "A local verify-full baseline of the phase base 5b189e4, with wall time and counts recorded; it is NOT green (two pre-existing stale docked-home assertions fail)"
    requirement: FOUND-10
    verification: []
    human_judgment: true
    rationale: "The recorded run exited 1 on tests/e2e/scene.spec.ts:111 and tests/e2e/docking.spec.ts:371 (stale labels after commit 46c9305). Whether to fix those two specs before split step 1 or accept them as known baseline failures is a decision for the orchestrator or owner."

duration: 43min
completed: 2026-11-13
status: complete
plan_head_before: 03cb780a5e5eec435c0add70b7a9723ae484c4f9
plan_head_after: 9f2083c35acff7d38b3930917ba9d549056ab2eb
---

# Phase 8 Plan 01: Safety nets before the session split Summary

**A six-state frozen shape of `window.__wegolite` (strict comparator, committed fixture, fast-gate spec) plus a concatenating session-source helper that the two source scans now read, with the verify-full baseline of the phase base recorded: 1424 unit tests green, 114 of 116 browser tests green, two stale docked-home assertions red.**

## Performance

- **Duration:** about 43 min of agent time (the baseline run alone is 25m56s)
- **Completed:** 2026-11-13T08:47Z
- **Tasks:** 2
- **Files modified:** 10 (6 created, 4 modified); no file under `src/` changed

## Accomplishments

- `probeShapeOf` reduces the live probe to a value-free shape inside the page (arrays become sorted element-shape sets, functions become "function", `economy.cargo` and `hud.bounds` become records); `compareProbeShapes` reports every drift the plan names with its dotted path and has no empty-array wildcard (T-08-40): empty matches empty only, unless the exact path is in the (empty) `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS`.
- `tests/e2e/probe-shape.spec.ts` samples menu, docked, paused, chart, in flight (after the launch autosave committed) and docked under `?test=1` (every `probe.test` member except `tainted` reads "function"), waits only on probe fields, and carries the optional-key audit table (a row for each of the 21 optional `WegoliteProbe` keys). The fixture is recorded from the unmodified monolith and passes `--repeat-each=3`.
- `test:e2e:fast` runs the spec; the container contract pins the four-spec script and count.
- `tests/helpers/session-source.ts` (facade plus `src/app/session/**`, code-unit order, throws on a missing facade) now backs `redraw-gate.test.ts` and `economy-purity.test.ts`; the gated `renderFrame` pair is compared as a sorted set and the docked arm is cut from the one file holding `case "docked":` after asserting it occurs exactly once across all sources. Every count, literal and regex is unchanged.
- The D-01 baseline is recorded below.

## Task Commits

1. **Task 1: Probe-shape pin end to end** - `1d18e62` (test)
2. **Task 2: Re-point the session source scans (step 0) and record the baseline** - `9f2083c` (test)

**Plan metadata:** the docs commit that carries this file (docs: complete plan).

## Files Created/Modified

- `tests/e2e/helpers/probe-shape.ts` - encoder, comparator, `PROBE_SHAPE_OPTIONAL_KEYS` (["hint"]), `PROBE_SHAPE_RECORD_PATHS`, `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS` ([])
- `tests/e2e/probe-shape.spec.ts` - the frozen-shape gate, audit table, write mode
- `tests/fixtures/probe-shape.json` - the six recorded shapes
- `tests/app/probe-shape-compare.test.ts` - 18 comparator and encoder tests
- `tests/helpers/session-source.ts`, `tests/app/session-source.test.ts` - the reader and its vacuity and ordering proof
- `tests/app/redraw-gate.test.ts`, `tests/guards/economy-purity.test.ts` - re-pointed scans
- `package.json`, `tests/contract/container-contract.test.ts` - the script string and its pin (CHANGELOG untouched: test-only)

## Optional-key audit result (review 10b4108 L36; Round 2 820a435 L162, L369)

- **Keys added to `PROBE_SHAPE_OPTIONAL_KEYS` beyond `hint`: none.** `hint` is the only timing-dependent key (the hint controller decides when to publish it). Notably it was present in all five session samples of the first recording, which does not make it strict: its presence depends on when the controller first runs.
- **Paths added to `PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS`: none.**
- **Repetition evidence:** three runs of the six tests with `--repeat-each=3` (18 tests each) all passed with no flaky count: one in the main tree before the commit, one more after the type-only helper tidy-up, and one in a detached worktree of `1d18e62`. No repetition failed, so no key was reclassified because of one.
- **Predicate tightening that came from reading the first recording, not from a failure:** the first fixture showed `save.notice`, `hud.hyperspaceTarget` and `economy.marketSystemId` published as the session starts, `hud.contacts` empty while docked but populated in flight, and `hints` empty while docked but populated in flight (`maybeShow` marks "launch" seen as soon as the mode leaves docked). The state predicates now wait for those (dotted path, trailing `[]` for non-empty), so a sample can never be taken in the gap. Docked `save.lastClock` is `"null"` deterministically (a New game writes nothing until launch, dock, trade or fit); in flight the spec waits for `save.committed >= 1` so it is a number.

## Split baseline (D-01)

- **Command:** `cd /tmp/wegolite-baseline && time docker compose -p wegolite-baseline run --rm verify-full`
- **Worktree path:** `/tmp/wegolite-baseline` (detached; removed afterwards, files owned by root were cleared with a one-shot container)
- **Compose project name:** `wegolite-baseline`
- **Commit:** `5b189e4` (the unmodified monolith), tree SHA `daeb242ab6f5ac13c469db0d5d421165055c95ad`
- **Route:** worktree. No fallback was needed. `git diff --quiet 5b189e4 -- Dockerfile package-lock.json .dockerignore` exited 0 before the run, so the existing `wegolite-ci` image was valid and no `--build` was used.
- **Wall time:** 25m56s (`real 25m56.194s`, 08:20:46Z to 08:46:46Z); the Chromium suite alone reported 24.1m.
- **Unit tests:** 105 files, 1424 passed, 1 skipped (1425). Lint, typecheck, `assets:check` and the production build passed.
- **Browser tests (Chromium, 2 workers):** 116 tests, 114 passed, 2 failed. **Exit code 1.** The chain stops at the Chromium stage, so the seams e2e stage never ran.
- **The two failures are not the Shift+C timeout.** The Shift+C test (`docking.spec.ts:596`) passed in this run, so no Shift+C rerun was needed. The failures are `tests/e2e/scene.spec.ts:111` (expects `Market (F8)`) and `tests/e2e/docking.spec.ts:371` (expects `Market [F8]`); the docked home now renders `F8 Market` since commit `46c9305` (docked home redesign, 2026-11-11) and the specs were never updated. A direct rerun of just those two tests on main HEAD failed identically, so they are deterministic, pre-existing and unrelated to this plan. See Deviations and `deferred-items.md` D-1.
- The baseline therefore does not satisfy "green", but it is exactly the baseline the split starts from: every split step must keep these two failures and no others until they are fixed.

## Gate attribution (shared tree)

| Gate | Commit | Tree SHA | Where it ran |
| ---- | ------ | -------- | ------------ |
| probe-shape spec, `--repeat-each=3` (18 passed) | `1d18e62` | `d20e30531d56dd5fa37b694050cca92e36709e3d` | detached worktree, project `wegolite-gate-08-01-t1`, removed afterwards |
| unit tests for task 1 (probe-shape-compare, container-contract), lint, typecheck | `1d18e62` content | same | main tree before the commit, with only this plan's files modified; a long-running `wegolite-preview-1` container (read-only dist server, up before this plan) was the only compose container |
| unit tests for task 2 (redraw-gate, economy-purity, session-source), lint, typecheck | `9f2083c` content | `6abd5d3b3408328aff600da349f486d02b0b9478` | main tree before the commit, same condition |
| verify-full baseline | `5b189e4` | `daeb242ab6f5ac13c469db0d5d421165055c95ad` | detached worktree, project `wegolite-baseline` |

## Decisions Made

- Kept the optional key list to `hint` and the volatile-empty-array list empty; see the audit result above.
- Recorded the baseline as measured instead of editing two specs outside this plan to turn it green (scope boundary).

## Deviations from Plan

### Deferred (out of scope)

**1. [Scope boundary] The verify-full baseline is not green on the phase base**
- **Found during:** Task 2 step 6
- **Issue:** two stale docked-home assertions in `tests/e2e/scene.spec.ts:111` and `tests/e2e/docking.spec.ts:371` fail on 5b189e4 and on main HEAD (labels changed by 46c9305). The plan's acceptance wording ("the worktree verify-full exits 0") cannot be met by this plan without editing files it does not own.
- **Action:** not fixed; logged in `.planning/phases/08-session-split-and-world-core/deferred-items.md` (D-1) and flagged to the orchestrator. The fast gate (`verify`) also runs both specs, so it is red for the same reason.
- **Verification:** the unit stage (1424 passed) and every other browser test (114) are green on the base; a rerun of the two failing tests on main HEAD reproduced them.

### Auto-fixed Issues

None. Two lint errors in the new files (`no-implied-eval` on `new Function`, redundant `unknown` union) were fixed before the first commit and are part of authoring, not deviations.

**Total deviations:** 0 auto-fixed, 1 deferred. **Impact:** the split starts from a baseline with two known, test-side failures; decide whether to fix them before step 1.

## Authentication Gates

None.

## Issues Encountered

- A `git worktree remove --force` failed with permission denied because the containers wrote `dist/`, `test-results/` and `coverage/` as root into the worktree. Cleaned with a one-shot `docker run` over the worktree directory, then `rmdir`; `git worktree prune` left no stale entry.

## Known Stubs

None.

## Threat Flags

None. T-08-01, T-08-02 and T-08-40 are mitigated as planned: write mode needs `WEGOLITE_PROBE_SHAPE_WRITE=1` and the spec header restricts it; the scans keep every count, literal and regex and the helper throws on a missing facade; the comparator has no empty-array wildcard.

## Next Phase Readiness

- Plan 08-04 (split step 1) can proceed on the safety nets: the fixture must stay byte-identical until the one deliberate post-split commit (08-16), and the two scans already read `src/app/session/**`.
- Open decision for the orchestrator: fix the two stale docked-home specs (deferred-items D-1) before split step 1, since the fast gate runs both.

## Self-Check: PASSED

- Files: all ten created or modified files exist on disk.
- Commits: `1d18e62` and `9f2083c` are ancestors of HEAD.
- `git diff --quiet 5b189e4 -- src/app tests/golden/content tests/golden/hyperspace tests/golden/market tests/golden/save tests/golden/kinematic-probe.json` exits 0; `git worktree list` shows only the main tree and no `wegolite-baseline` or `wegolite-gate-08-01-t1` volume remains.
