---
phase: quick
plan: 261117-v1v
subsystem: ci
status: complete
tags: [ci, github-actions, playwright, sharding, e2e-timeouts, compose]
requires: []
provides:
  - verify-checks Compose service (verify-full minus the full Chromium stage)
  - sharded .github/workflows/verify.yml (checks job, four Chromium shards, aggregate verify job)
  - contract guards for verify-checks drift and the sharded workflow
  - frame-sized e2e waits for the autosave matrix and the four other tests at or above 60 %
affects:
  - .github/workflows/pages.yml (unchanged; still gated on the verify workflow conclusion)
tech-stack:
  added: [actions/upload-artifact@v4]
  patterns: [Playwright --shard=N/4 job matrix, aggregate needs job]
key-files:
  created: []
  modified:
    - compose.yaml
    - .github/workflows/verify.yml
    - tests/contract/container-contract.test.ts
    - tests/e2e/autosave.spec.ts
    - tests/e2e/hyperspace.spec.ts
    - tests/e2e/hud.spec.ts
    - tests/e2e/scene.spec.ts
    - tests/e2e/probe-shape.spec.ts
    - tests/render/planet-budget.test.ts
    - AGENTS.md
    - README.md
    - .planning/PROJECT.md
    - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
decisions:
  - "CI shards the Chromium suite: verify.yml runs a verify-checks job and four --shard=N/4 Chromium jobs (fail-fast false) behind an aggregate verify job; the verify-full service stays the unchanged local and remote release gate"
  - "Frame-bound e2e waits are doubled (180 s to 360 s, 240 s to 480 s) and five tests at or above 60 % of their CI timeout get budgets that put the worst observed CI time at or below 50 %"
metrics:
  duration: 16 min
  completed: 2026-11-17
estimate:
  tokens: 80000
  tasks: 3
actuals:
  tokens: 12000
  tasks: 3
  commits: 4
plan_head_before: a055a78c3fc1d0516dfa52934e92f036e42a2e39
plan_head_after: bcc197bbc752df095c875b11c3e943a07ec53212
---

# Quick 261117-v1v: Shard the CI browser run and fix the autosave timeout Summary

The CI `verify` workflow is now a `checks` job (`docker compose run --rm verify-checks`) and four `--shard=N/4` Chromium jobs, with an aggregate `verify` job after them. The autosave trigger-matrix arrival wait that timed out on CI is frame-bound and now has double the bound plus probe diagnostics. All five tests at or above 60 % of their CI timeout got larger budgets. Remote runs of verify-checks, shard 1/4 and the other edited specs all exit 0 on bcc197b.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | 9e7b571 | ci(quick-261117-v1v): shard the CI Chromium suite into four jobs beside a checks job |
| 2 | 754d7af | test(quick-261117-v1v): frame-sized e2e waits for the autosave matrix and every test at 60 % of its CI timeout |
| 3 | 5669ede | docs(quick-261117-v1v): record the sharded CI gate and the raised e2e timeouts |
| 3 (fix) | bcc197b | test(quick-261117-v1v): move the frozen HUD wait pin to the raised 450 s and 480 s |

## What changed

- **compose.yaml:** a new `verify-checks` service after `verify-full`, on the `*workspace` anchor with `ipc: host`. It runs lint, typecheck, assets:check, test, build:e2e, check:dist and test:e2e:seams as one `&&` chain. The `verify-full` block is byte-for-byte unchanged (`git diff` adds lines only).
- **.github/workflows/verify.yml:** the `name: verify`, `on:` and `permissions:` blocks are unchanged. The file now has three jobs:
  - `checks`: runs `verify-checks`, with a 60 min timeout.
  - `e2e`: named `chromium shard N/4`, with `fail-fast: false` and `shard: [1, 2, 3, 4]`. Each leg runs `docker compose run --rm e2e sh -lc "npm run build:e2e && npm run test:e2e -- --shard=${{ matrix.shard }}/4"`. On failure it uploads `test-results/` as `playwright-results-shard-N`, kept 7 days, with `if-no-files-found: ignore`.
  - `verify`: the aggregate job. It has `needs: [checks, e2e]` and `if: ${{ !cancelled() }}`, and it fails unless both results are `success`. The results reach the step through `env`, not inline expressions.

  No `run:` step invokes verify-full. actionlint 1.7.9 reports no errors.
- **tests/contract/container-contract.test.ts:**
  - `verify-checks` is added to the anchor and no-ports lists and to the D-09 Firefox negative.
  - The bundle-users test now expects five services.
  - New case: `verify-checks` must equal the `verify-full` stages minus exactly one `npm run test:e2e` stage. The expectation is derived from `verify-full`, not written as a second literal.
  - New case: the workflow keeps its name, the shard matrix, `fail-fast`, `needs` and the verify-checks run line, and has no `run:` that calls verify-full. pages.yml still has `workflows: [verify]` and the success gate.
- **e2e specs:**

  | Test | Change |
  | ---- | ------ |
  | autosave trigger matrix | per-test budget 1,200 s; fly-away 240 s to 480 s; arrival wait 180 s to 360 s, wrapped in a try/catch that reports renders, countdown, systemId and lastRefusal (or "probe unavailable") |
  | hyperspace.spec.ts "chart target, countdown, abort, refusal, arrival and reload" | per-test budget 1,200 s; fly-away 480 s; commit wait 360 s |
  | hyperspace.spec.ts "a jump completed beside the station is refused as blocked" | blocked-refusal wait 360 s; keeps the 600 s file budget |
  | HUD message line | budget 330 s to 480 s; wait 300 s to 450 s |
  | scene.spec.ts:15 and the in-flight probe shape | 60 s each |

  The stale "(line 44)" and "(line 27)" references were dropped. The file-level 600 s budgets stay. No assertion, input sequence or distance changed.

## Discretion choices

- **A new `verify-checks` Compose service instead of a chain inlined in the workflow.** It can run locally and on the remote machine, and the contract test derives it from verify-full, so the two cannot drift.
- **Shards reuse the existing `e2e` service with a command override.** This is the documented targeted-browser pattern, and pages.yml already uses it. No new service was needed.
- **An aggregate job named `verify`.** It gives one stable check name for future branch protection. pages.yml does not need it, because a failed leg already fails the whole run.
- **Doubled frame-bound waits instead of restructuring the test flow.** For example, overlapping the countdown with the fly-away would change what the tests prove.

## CI timeout shares

The default timeout is 30 s. "Before" is the worst share on runs 44125946218, 44104008208 and 44081312313. "Expected after" is that same worst time divided by the new bound.

| Test | Worst CI time | Old bound | Before | New bound | Expected after |
| ---- | ------------- | --------- | ------ | --------- | -------------- |
| autosave trigger matrix | 450 s | 600 s | 75 % | 1,200 s | 38 % |
| hyperspace.spec.ts:194 | 426 s | 600 s | 71 % | 1,200 s | 36 % |
| HUD message line | 210 s | 330 s | 64 % | 480 s | 44 % |
| scene.spec.ts:15 | 22.7 s | 30 s | 76 % | 60 s | 38 % |
| in-flight probe shape | 23.8 s | 30 s | 79 % | 60 s | 40 % |
| autosave arrival wait (inner) | failed at 180 s | 180 s | 100 % | 360 s | n/a; it now reports probe state |

**Step 0, the refresh.** Run 44178466149 (HEAD 3b248d8) completed green while this plan ran: 22.5 min total, of which the e2e stage took 17.3 min on a fast runner. I also read the completed failure run 44119258868. On both runs, no test outside the five above reaches 60 % of its own timeout. The highest are:
- 44178466149: autosave 234 s of 600 s (39 %), core-loop 228 s of 900 s, traffic 90 s of 360 s (25 %), combat 43 s of 240 s.
- 44119258868: everything is lower still.

The HUD test took only 39.7 s on 44178466149, after quick 261117-u3m changed the message rows. The 210 s worst case comes from the earlier run.

Run 44180505539 (a055a78) was still running at SUMMARY time.

## Shard distribution

Measured with `--list` at a055a78. The shards split by file because `fullyParallel` is false. I did not rebalance them.

| Shard | Tests | Files | Specs |
| ----- | ----- | ----- | ----- |
| 1/4 | 38 | 6 | autosave, chart-gestures, compliance-shipped, aspect, budget, combat |
| 2/4 | 33 | 11 | docking, dispose, fallback, launch, context-loss, hud, hyperspace, core-loop, engine, flight, laser-shots |
| 3/4 | 32 | 9 | save-load, probe-shape, settings, scene, npc-assets, models, npc-flight, precision, resize |
| 4/4 | 34 | 5 | station-tabs, station, tick-hook, traffic, throttle |

The four shards add up to 137, which equals the unsharded total (137 tests in 31 files), so sharding loses no spec. Shard 2 holds the three longest tests (hyperspace:194, core-loop, the HUD message line), so I expect it to be the slowest shard, at about 15 to 20 min on a slow runner.

## Verification

**Local Docker:**
- `docker compose config -q`: passed.
- actionlint 1.7.9: passed.
- Contract test: 26/26 passed.
- Shard listing sums: 38 + 33 + 32 + 34 = 137, equal to the unsharded total.
- typecheck: passed.
- lint (eslint and prettier): passed.
- `tests/render/planet-budget.test.ts`: 16/16 passed.
- Acceptance greps for Tasks 1 to 3 all match their expected counts. pages.yml is untouched.

**Remote machine** (`wegolite-remote-run.sh`, committed snapshot bcc197b, runs made one after another):

| Run | Result | Elapsed | Details |
| --- | ------ | ------- | ------- |
| a. `run --rm verify-checks` | exit=0 | 142 s | Vitest 220 files, 5682 passed, 10 skipped; seams spec 2 passed (31.3 s) |
| b. `run --rm e2e sh -lc "npm run build:e2e && npm run test:e2e -- --shard=1/4"` | exit=0 | 132 s | 38 passed (2.1 min); the autosave trigger matrix passed in 1.3 min against its 1,200 s budget |
| c. `run --rm e2e sh -lc "npm run build:e2e && npx playwright test --project=chromium tests/e2e/hyperspace.spec.ts tests/e2e/hud.spec.ts tests/e2e/scene.spec.ts tests/e2e/probe-shape.spec.ts"` | exit=0 | 110 s | 17 passed (1.8 min) |

Durations in run c:
- hyperspace "chart target…": 1.3 min of 1,200 s.
- blocked refusal: 26.8 s of 600 s.
- HUD message line: 17.1 s of 480 s.
- scene:15: 6.9 s of 60 s.
- in-flight probe shape: 7.3 s of 60 s.

The remote machine is 2.5 to 3 times faster than CI, so these runs prove the tests are correct, not that they have enough margin on CI.

The first remote run, on 5669ede, exited 1. The cause is Deviation 1 below, and run a above is the rerun after the fix.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A frozen delivery contract pinned the old HUD timeouts.**
- **Found during:** Task 3, remote run a on 5669ede (exit=1, 1 failed test).
- **Issue:** `tests/render/planet-budget.test.ts` ("frozen delivery contract") requires `test.setTimeout(330_000)` and `timeout: 300_000` in hud.spec.ts. The plan raised both values and did not list this guard.
- **Fix:** the pin and its two controls ("rejects a shortened HUD wait/test timeout") now use 450_000 and 480_000. A comment records the change and its CI evidence. The guard still rejects any shortened value, which is what it is for. The pin is not an owner-recorded decision in PROJECT.md, and it is not one of the frozen NPC acceptance detectors.
- **Files modified:** tests/render/planet-budget.test.ts
- **Commit:** bcc197b

**2. [Rule 3 - Blocking] The Commands-table rows for verify-checks moved from Task 3 into Task 1.**
- **Found during:** Task 1, the targeted contract test.
- **Issue:** FOUND-09 ("documents every declared service … in both guides") failed once the `verify-checks` service existed. Task 1 could not be committed green without the docs rows.
- **Fix:** the AGENTS.md and README.md table rows were added and formatted in Task 1 (commit 9e7b571). The prose changes stayed in Task 3.
- **Commit:** 9e7b571

**3. [Rule 1 - Bug] The HUD timeout error message named the old bound.**
- **Found during:** Task 2.
- **Issue:** the plan said to keep the HUD catch block unchanged, but its message read "had not expired after 300 s", which would be wrong after the change.
- **Fix:** only that number changed, to 450 s. The diagnostics logic is unchanged.
- **Commit:** 754d7af

**4. [Rule 1 - Doc accuracy] The AGENTS.md Docker-workflow code comment.**
- **Issue:** the comment above `docker compose run --rm verify-full` said "CI runs this".
- **Fix:** it now says CI runs the chain split into parallel jobs.
- **Commit:** 5669ede

## Not due / omitted

- **NPC acceptance run:** not due. No file under `src/` changed.
- **CHANGELOG.md:** omitted. This is an internal CI and test change, which AGENTS.md allows us to leave out. Released sections and the v0.5.0 tag were not touched.
- **Push:** not done. The orchestrator pushes.

## Known Stubs

None.

## Threat Flags

None. The only new surface is `actions/upload-artifact@v4`, which is already in the threat register (T-v1v-03, T-v1v-SC). The `pull_request` trigger and `permissions: contents: read` are unchanged.

## Self-Check: PASSED

- The files exist: compose.yaml (verify-checks), .github/workflows/verify.yml, tests/contract/container-contract.test.ts, the five specs, tests/render/planet-budget.test.ts, and the todo with the 261117-v1v status.
- Commits 9e7b571, 754d7af, 5669ede and bcc197b are ancestors of HEAD (`git rev-list --count a055a78..HEAD` = 4).

Orchestrator pushes and watches the CI run: the checks job, chromium shards 1-4 and the aggregate verify job must all be green, the slowest shard is expected to be shard 2, and the pages workflow must start from workflow_run only after the run succeeds. Afterwards, re-measure the timeout shares per shard against the 60 % rule.
