---
created: 2026-11-20T17:30:00.000Z
title: Stop the dist-check source scan racing the purity guards' probe files
area: tooling
severity: low
files:
  - tools/ai-harness/dist-check.test.ts
  - tests/guards/sim-probe.ts
  - .planning/phases/18-stations-buoys-and-collisions/deferred-items.md
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

Found by plan 18-22 (logged in the Phase 18 `deferred-items.md`), pre-existing. The purity guards write
short-lived probe files such as `src/sim/__purity_ban_queue_microtask.ts` through `tests/guards/sim-probe.ts`
(`writeFileSync`, then `rmSync`). The dist-check test "has none in any file under src/ or public/, comments
included" lists the tree and then reads each file, so a probe removed between the listing and the read fails
it with `ENOENT` (`tools/ai-harness/dist-check.test.ts:184`). Seen once in the remote `verify` at `6bae6ac`
(1 failed, 6,975 passed); the rerun passed. The same class of race was fixed for the `tests/content/` scanners
on 2026-11-18 (completed todo `2026-11-17-fix-content-boundary-probe-race.md`).

## Solution

Make the dist-check skip `__purity_*` probe files, as the content scanners, `tests/compliance.test.ts` and
`tests/sim/rng.test.ts` already do, or skip a file that vanished after the listing. A tooling quick task.
