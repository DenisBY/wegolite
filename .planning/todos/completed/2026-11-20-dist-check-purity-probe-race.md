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

## Second sighting (2026-11-26, plan 22-14)

The same class of race hit another scanner: `tests/guards/harness-isolation.test.ts` failed once in a remote
`verify-full` (snapshot `0c5c72ca`) with `ENOENT` on `src/sim/ai/__purity_probe_2.ts`, a probe file that
`tests/guards/ai-zone.test.ts` creates and deletes while the isolation guard walks the tree. The rerun at the
same snapshot passed. Not isolated or confirmed. Fix both scanners together: skip `__purity_*` files, or skip a
file that vanished after the listing.

## Resolution

Done 2026-11-27 (quick 261127-dbj). The shared walker `listFilesUnder` / `readdirIfPresent` in
`tests/guards/source-scan.ts` skips `__purity_*` entries (files and directories) and tolerates a probe
directory that vanished between its parent's listing and its own (the transient `src/sim/ai/nested/` and
`src/sim/ai/pilots/roles/`). A missing scan root still throws, and file reads stay strict. `listSrcFiles` is
built on it. `tools/ai-harness/dist-check.test.ts`, `tests/guards/harness-isolation.test.ts`, the D-12
reload test in `tests/app/session/death-flow.test.ts` and the COMBAT_AI_ ledger scan in
`tests/sim/npc/constants.test.ts` scan through it.

Left alone on purpose: `tests/compliance.test.ts` and the six `tests/content/` scanners (ai-map, explosions,
ships-debris, ships-hulls, ships-npc, ships-static-hulls) already skip `__purity_*` files; they still descend
into the two transient probe directories without vanished-directory tolerance, a window of microseconds that
has never been seen. `tests/guards/sim-purity.test.ts`, `tests/sim/rng.test.ts` and
`tests/guards/entity-id-scope.test.ts` are already tolerant. `tests/helpers/session-source.ts`
(`src/app/session/`) and `tests/guards/economy-purity.test.ts` (`src/sim/economy/`) walk directories that no
probe is written into.
