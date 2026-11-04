---
phase: quick-261104-p2m
plan: 261104-p2m
subsystem: testing / browser gate / decision record
tags:
  - playwright
  - swift-shader
  - message-expiry
  - frozen-contract
  - uat
  - g-03-3

requires:
  - phase: quick-261104-oif
    provides: the loaded per-frame render-cost verdict (369.4 ms frame, ~281 ms planet fragment shader) that grounds the accepted-known-issue decision
  - phase: 03-flight-in-the-lave-system
    provides: plan 03-14's 9-evaluation planet budget, its halted cadence-gate record, and the frozen-delivery-contract guard

provides:
  - tests/e2e/hud.spec.ts — 300 s correctness wait under a 330 s test timeout with a diagnostic timeout message (renders/flightTime plus the original error as cause)
  - playwright.config.ts — workers: 2 pinned with the 4-CPU / two-page rationale
  - tests/render/planet-budget.test.ts — frozenContractViolations now requires test.setTimeout(330_000), timeout: 300_000 and workers: 2, with four message-specific negative controls
  - the accepted-known-issue decision recorded in PROJECT.md, 03-UAT.md, 03-14-SUMMARY.md and 03-VERIFICATION.md

affects:
  - G-03-3 — resolved as an accepted known issue, not a fixed defect; the product is unchanged
  - any future edit to the HUD wait, the HUD test timeout or the worker count now fails a fast unit test
  - Phase 7 QUAL-01 — the 60 fps at 1080p measurement remains the real performance gate, on a real GPU

actuals:
  tokens: 4728
  tasks: 3
  commits: 3
  plan_head_before: 6112356ac24bb7a42be4394706d86e809930c807
  plan_head_after: 313a2bf

tech-stack:
  added: []
  patterns:
    - a slow software-rasterised correctness wait is raised and pinned, never left to a runner-derived default
    - the frozen-contract guard requires the pinned literals and proves each requirement with a message-specific negative control

key-files:
  created: []
  modified:
    - tests/e2e/hud.spec.ts
    - playwright.config.ts
    - tests/render/planet-budget.test.ts
    - .planning/phases/03-flight-in-the-lave-system/03-UAT.md
    - .planning/PROJECT.md
    - .planning/phases/03-flight-in-the-lave-system/03-14-SUMMARY.md
    - .planning/phases/03-flight-in-the-lave-system/03-VERIFICATION.md

key-decisions:
  - "Accept G-03-3 as a known issue: the 24 fps and 133 s figures were never requirements; QUAL-01 is Phase 7 on a real GPU; the cheap levers (antialias:false, half resolution) would change the approved look"
  - "Stabilise the brittle gate instead of changing the product: wait 150 s -> 300 s under a 330 s timeout, workers: 2 pinned, and both frozen in the guard"
  - "Keep 03-14 status: halted and its superseded 133 s gate as history; append the decision rather than rewriting it"

patterns-established:
  - "A slow-but-correct browser wait is documented as a correctness wait on simulated time, with a timeout message that names the observed probe renders and flightTime"
  - "Pinned test configuration is guarded as source text with negative controls that assert the literal, so a silent relaxation fails fast"

requirements-completed: []

coverage:
  - id: D1
    description: "The message-expiry spec waits 300 s under a 330 s test timeout and reports the observed renders/flightTime plus the original error on timeout"
    verification:
      - kind: e2e
        ref: "tests/e2e/hud.spec.ts#the message line is one clamped line and expires on flightTime"
        status: pass
      - kind: unit
        ref: "tests/render/planet-budget.test.ts#rejects a shortened HUD wait / rejects a shortened HUD test timeout"
        status: pass
    human_judgment: false
  - id: D2
    description: "playwright.config.ts pins workers: 2 and the frozen-contract guard requires it with controls for a reduced count and a removed pin"
    verification:
      - kind: unit
        ref: "tests/render/planet-budget.test.ts#frozen delivery contract"
        status: pass
    human_judgment: false
  - id: D3
    description: "G-03-3 recorded as an accepted known issue coherently across PROJECT.md, 03-UAT.md, 03-14-SUMMARY.md and 03-VERIFICATION.md, with the product byte-identical"
    verification:
      - kind: other
        ref: "rg -n '^passed: 6$|^issues: 0$|^pending: 0$' .planning/phases/03-flight-in-the-lave-system/03-UAT.md; rg -n 'status: resolved|Accepted as a known issue' 03-UAT.md; rg -n 'Accept the SwiftShader e2e cadence as a known issue' .planning/PROJECT.md"
        status: pass
      - kind: other
        ref: "git diff e0367eb -- src/ (empty: product byte-identical)"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-04
status: complete
---

# Quick Task 261104-p2m: Stabilise the message-expiry browser gate Summary

**The message-expiry browser gate now waits 300 s under a 330 s timeout with a diagnostic failure, `workers: 2` is pinned and guarded by four negative controls, and G-03-3 is recorded as an accepted known issue with no product change.**

## Performance

- **Duration:** 10 min (629 s)
- **Started:** 2026-11-04T17:06:45Z
- **Completed:** 2026-11-04T17:17:14Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Raised the message-expiry wait 150 s → 300 s under a 330 s test timeout, documented as a correctness wait on simulated time rather than a performance claim; a timeout now rethrows with the observed `renders`/`flightTime` and the original error as `cause`.
- Pinned `workers: 2` immediately after `fullyParallel: false`, with the 4-CPU / two-concurrent-page rationale.
- Updated `frozenContractViolations` to require `test.setTimeout(330_000)`, `timeout: 300_000` and `/\bworkers\s*:\s*2\b/`, with four controls that fire and name their literal (shortened wait, shortened test timeout, reduced worker count, removed worker pin).
- Recorded the accepted-known-issue decision consistently in `03-UAT.md` (6/6, zero issues/pending, G-03-3 `status: resolved` with its restatement kept), `PROJECT.md` Key Decisions, the `03-14-SUMMARY.md` addendum (status stays `halted`) and a `03-VERIFICATION.md` re-verification section.
- Left the product byte-identical: `git diff e0367eb -- src/` is empty.

## Task Commits

Each task was committed atomically on `main`:

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | Raise the message-expiry ceiling and pin the worker count | `3e7e778` | fix |
| 2 | Freeze the pinned browser-gate configuration in the guard | `0d41ed7` | test |
| 3 | Record the accepted-known-issue decision without rewriting history | `313a2bf` | docs |

**Plan metadata:** none — this SUMMARY is intentionally left uncommitted; the orchestrator commits it together with STATE/ROADMAP.

## Files Created/Modified

- `tests/e2e/hud.spec.ts` — 300 s wait, 330 s test timeout, five-line correctness-wait comment, try/catch diagnostic rethrow
- `playwright.config.ts` — `workers: 2,` with the contention rationale
- `tests/render/planet-budget.test.ts` — header bullet and `frozenContractViolations` doc comment, required literals, four HUD/worker controls
- `.planning/phases/03-flight-in-the-lave-system/03-UAT.md` — `status: complete`, 6/6 summary, item 1 pass with the real-GPU quote, item 5 pass with the resolution, G-03-3 `status: resolved` + `resolution`
- `.planning/PROJECT.md` — one appended Key Decisions row
- `.planning/phases/03-flight-in-the-lave-system/03-14-SUMMARY.md` — `## Addendum (2026-11-04)` after the Self-Check
- `.planning/phases/03-flight-in-the-lave-system/03-VERIFICATION.md` — `## Re-verification (2026-11-04)` appended

## Decisions Made

- Accept the SwiftShader cadence as a known issue rather than changing the approved look; the 24 fps / 133 s figures were never requirements and QUAL-01 is measured in Phase 7.
- The wait is pinned configuration, not a performance number: pinning keeps the instrument comparable without lowering the product bar.
- `03-14` keeps `status: halted` and its superseded 133 s / 1.3x gate; the new sections append the decision instead of rewriting history.

## Deviations from Plan

None in code or content — the plan's literal strings, thresholds, control names and decision wording were applied as written. One verification retry is documented under Issues Encountered (pre-existing flake, no code change).

## Issues Encountered

- The first `docker compose run --rm verify` (88 s) exited 1 on a **pre-existing, unrelated flake**: `tests/guards/content-boundary.test.ts > the Phase 3 layer denials > removes the probe even when the body throws` hit Vitest's 5 s default timeout. It is already recorded in `.planning/STATE.md` blockers (commit `95fcd9d`) as a test-infra item unrelated to 03-14. Out of scope for this plan (which forbids changing unnamed test thresholds), so it was not edited; `verify` was re-run and passed.
- The second `verify` run: **exit 0, 29/29 Playwright passed in 5.0 m; total wall clock 388 s (6 m 28 s)**. The message-expiry test itself reported 2.6 m.

## Verification

Run in Docker from the repository root:

- `docker compose run --rm typecheck` — exit 0; `docker compose run --rm lint` — ESLint and Prettier clean (Task 1).
- `docker compose run --rm test npx vitest run tests/render/planet-budget.test.ts` — 1 file, **16 tests passed** (Task 2 and again for Task 3).
- `docker compose run --rm verify` — first attempt exit 1 (known content-boundary flake above); retry **exit 0**, lint + typecheck + `assets:check` + 530 unit tests + build + **29/29 Playwright**, wall clock **388 s**.
- `git diff e0367eb -- src/` — prints nothing (0 lines): the product is byte-identical.
- `git diff --name-only e0367eb` — exactly the seven plan files plus the orchestrator's `261104-p2m-PLAN.md`.
- Content gates (host `rg`, read-only): both HUD literals once each (`hud.spec.ts:215`, `:235`); `workers: 2` in `playwright.config.ts:11` and in the guard message; `^passed: 6$`, `^issues: 0$`, `^pending: 0$`; `status: resolved` and `Accepted as a known issue` in `03-UAT.md`; and the PROJECT.md decision row.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The browser gate is green (29/29) and stable at the pinned 300 s / 330 s / `workers: 2` configuration.
- G-03-3 is closed as an accepted known issue with a written rationale; WR-08 and WR-09 remain open review items, not blockers.
- The `content-boundary.test.ts` 5 s flake remains an open test-infra blocker (pre-existing).

---

## Self-Check: PASSED

- `tests/e2e/hud.spec.ts` — FOUND, `test.setTimeout(330_000)` and `timeout: 300_000` present
- `playwright.config.ts` — FOUND, `workers: 2,` present
- `tests/render/planet-budget.test.ts` — FOUND, 16/16 tests pass
- `.planning/phases/03-flight-in-the-lave-system/03-UAT.md` — 6/6, G-03-3 resolved — FOUND
- `.planning/PROJECT.md` — decision row FOUND
- `.planning/phases/03-flight-in-the-lave-system/03-14-SUMMARY.md` — addendum FOUND
- `.planning/phases/03-flight-in-the-lave-system/03-VERIFICATION.md` — re-verification FOUND
- Commits `3e7e778`, `0d41ed7`, `313a2bf` — all ancestors of HEAD
- `docker compose run --rm verify` — exit 0, 29/29 Playwright (388 s wall clock)
- `git diff e0367eb -- src/` — empty
