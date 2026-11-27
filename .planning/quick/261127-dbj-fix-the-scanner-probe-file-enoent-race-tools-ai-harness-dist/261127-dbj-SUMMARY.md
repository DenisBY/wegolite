---
phase: quick-261127-dbj
plan: 01
subsystem: test-tooling
tags: [tests, guards, flaky-race, source-scan]
requires: []
provides:
  - "listFilesUnder / readdirIfPresent in tests/guards/source-scan.ts (probe-skipping, vanished-directory-tolerant walker)"
affects:
  - tools/ai-harness/dist-check.test.ts
  - tests/guards/harness-isolation.test.ts
  - tests/app/session/death-flow.test.ts
  - tests/sim/npc/constants.test.ts
tech-stack:
  added: []
  patterns: ["one shared walker for source scans"]
key-files:
  created:
    - tests/guards/source-scan.test.ts
  modified:
    - tests/guards/source-scan.ts
    - tools/ai-harness/dist-check.test.ts
    - tests/guards/harness-isolation.test.ts
    - tests/app/session/death-flow.test.ts
    - tests/sim/npc/constants.test.ts
    - .planning/todos/completed/2026-11-20-dist-check-purity-probe-race.md
decisions:
  - "No CHANGELOG entry: internal test tooling"
status: complete
commits: 3
plan_head_before: 22b8441fb2fe5ff53419e1e4ad0fe9f24979a11f
plan_head_after: 971e0d445512c61945e65bdfa92c3579bd99a239
actuals:
  tasks: 3
  commits: 3
metrics:
  completed: 2026-11-27
---

# Phase quick-261127-dbj Plan 01: Scanner probe-file ENOENT race Summary

Shared `listFilesUnder` / `readdirIfPresent` walker in `tests/guards/source-scan.ts` skips `__purity_*` probes and tolerates a probe directory that vanished mid-walk; four source scanners now use it.

## What changed

- `tests/guards/source-scan.ts`: new `readdirIfPresent` (returns `[]` only on ENOENT with the directory gone; rethrows everything else) and `listFilesUnder` (posix repo-relative regular files, code-unit sorted, skips any `__purity_*` entry, missing scan root throws). `listSrcFiles` is now `listFilesUnder("src")` filtered to `.ts`.
- `tests/guards/source-scan.test.ts` (new, 7 tests): sorted listing, probe skipping with near-miss names kept, missing root ENOENT, vanished directory, ENOTDIR on a file, and `listSrcFiles` on the committed tree.
- `tools/ai-harness/dist-check.test.ts` and `tests/guards/harness-isolation.test.ts`: src/ and public/ listed through `listFilesUnder`; the local walkers are gone. Non-vacuity assertions unchanged (`files.length > 100`; src/ and public/ entries walked). harness-isolation now fails on a missing src/ or public/ instead of skipping silently.
- `tests/app/session/death-flow.test.ts` (D-12) and `tests/sim/npc/constants.test.ts` (COMBAT_AI_ ledger scan) use `listSrcFiles()`; the only assertion change is the `src/`-prefixed reloader path `src/ui/game-over.ts`.
- Todo `2026-11-20-dist-check-purity-probe-race.md` moved to `completed/` with a Resolution section.

## Verification

- Local (Docker): source-scan, dist-check, harness-isolation, death-flow, npc/constants pass; all 15 `listSrcFiles` consumer files pass (120 tests); lint and typecheck clean.
- Remote full Vitest suite at HEAD 971e0d44: 323 files passed, 1 skipped (324); 10464 tests passed, 16 skipped (10480); 0 failed. Single run, no rerun needed.

## Deviations from Plan

None - plan executed exactly as written (prettier formatting applied to the two new/changed source-scan files after lint flagged them).

## Out of scope (left unchanged, see the todo Resolution)

`tests/compliance.test.ts` and the six `tests/content/` scanners already skip `__purity_*` files but still descend into the two transient probe directories without vanished-directory tolerance (never observed); `sim-purity`, `rng` and `entity-id-scope` tests are already tolerant; `tests/helpers/session-source.ts` and `tests/guards/economy-purity.test.ts` walk directories no probe is written into.

## Known Stubs

None.

## Threat Flags

None.

## Self-Check: PASSED

Created/modified files exist; commits 3b5577b3, 1c8a29b8, 971e0d44 are ancestors of HEAD.
