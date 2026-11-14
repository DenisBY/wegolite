---
phase: 09-npc-content
plan: 05
subsystem: render
tags: [asset-cache, lazy-loading, npc-ships, cold-start, playwright, vitest, performance]
status: complete
requires:
  - phase: 09-npc-content
    provides: "09-03 nine NPC GLBs and 43 textures under public/; 09-04 ships-npc.json records and the import-free NPC_GLB_PATH_PATTERN"
provides:
  - "AssetCache.loadNpcModel(glb): lazy, memoised per path, guarded by NPC_GLB_PATH_PATTERN, failure-forgetting, freed by dispose()"
  - "Cold-start request log in budget.spec.ts proving no NPC GLB (9) and no NPC texture (43) is requested, beside the unchanged 9 MiB ceiling"
  - "tests/e2e/npc-assets.spec.ts: all nine NPC GLBs served and all 43 images decode on demand in Chromium"
  - "Measured Phase 9 cold-start transfer in docs/PERFORMANCE.md, CHANGELOG entry, five Key Decisions rows"
affects: [10, 12]
plan_head_before: c2ea7b3e2f3b41b774d069b7d5035d0ff58c2115
plan_head_after: 821fdd7352f90aab204c49fb9ac5f96748ece78b
actuals:
  tokens: 8500
  tasks: 3
  commits: 5
tech-stack:
  added: []
  patterns:
    - "lazy entry point owned by the cache: the cache that loads a model frees it, and a load that settles after dispose() is handed back but not cached"
    - "request-log vacuity guard: the cold-start test asserts the NPC set is 9 GLBs and 43 textures and that cobra3.glb IS in the log, so an empty log cannot pass"
key-files:
  created:
    - tests/app/asset-cache-npc.test.ts
    - tests/e2e/npc-assets.spec.ts
  modified:
    - src/render/asset-cache.ts
    - tests/app/dispose.test.ts
    - tests/e2e/budget.spec.ts
    - tools/oolite-ingest/convert/textures.test.ts
    - docs/PERFORMANCE.md
    - CHANGELOG.md
    - .planning/PROJECT.md
key-decisions:
  - "Phase 9 gate: verify instead of verify-full for the additive asset-cache change (owner decision 2026-11-13, Phase 9 only), recorded in Key Decisions."
  - "Network vendoring exception (commit 7437f22, 42 files, host-run read-only cross-check) recorded in Key Decisions; 09-01 checkpoint confirmation delegated to the orchestrator, see 09-01-SUMMARY.md."
  - "No synchronous npcModel accessor is added; the loadNpcModel promise carries the model and Phase 12 adds an accessor only if its render path needs one."
requirements-completed: [DATA-13]
coverage:
  - id: D1
    description: "AssetCache.loadNpcModel loads lazily through the shared loader seam, memoised per path, refuses paths outside models/<name>.glb without a loader call, forgets a failed load, and dispose() frees every NPC resource once; preload() unchanged"
    requirement: DATA-13
    verification:
      - kind: unit
        ref: "tests/app/asset-cache-npc.test.ts"
        status: pass
      - kind: unit
        ref: "tests/app/dispose.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "A cold start to the first in-flight frame requests none of the nine NPC GLBs or 43 NPC textures and transfers 8,834,862 bytes under the unchanged 9,437,184 ceiling"
    requirement: DATA-13
    verification:
      - kind: e2e
        ref: "tests/e2e/budget.spec.ts#a cold start to the first in-flight frame stays under the first-load bytes ceiling"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each NPC GLB is fetchable on demand (200, GLB magic, version 2, declared length) and each of its images is served and decodes through createImageBitmap"
    requirement: DATA-13
    verification:
      - kind: e2e
        ref: "tests/e2e/npc-assets.spec.ts#each NPC role model is fetchable on demand and every texture it references decodes"
        status: pass
    human_judgment: false
  - id: D4
    description: "Phase gate: docker compose run --rm verify green (run 2), then the targeted budget and NPC browser specs pass"
    verification:
      - kind: other
        ref: "docker compose run --rm verify (log /tmp/wegolite-09-05/verify-run2.log)"
        status: pass
    human_judgment: false
duration: ~40min recorded commit span (23:58 to 00:37 CET; execution start not tracked)
completed: 2026-11-14
---

# Phase 9 Plan 5: Lazy NPC models and the cold-start proof Summary

**AssetCache.loadNpcModel loads the nine Oolite NPC models on demand (memoised, path-guarded, freed by dispose), and a request-log browser test proves a cold start fetches none of the 9 GLBs or 43 textures while transferring 8,834,862 bytes under the unchanged 9,437,184-byte ceiling.**

## Performance

- **Duration:** about 40 minutes of recorded commit span; the plan's start time was not tracked
- **Completed:** 2026-11-14
- **Tasks:** 3 (plus one gate-fix commit)
- **Files modified:** 9 in this plan's own commits (plus the 09-01 summary in the closing 09-01 commit)

## Accomplishments

- `AssetCache.loadNpcModel(glb)` in `src/render/asset-cache.ts`: refuses any path that fails `NPC_GLB_PATH_PATTERN` before the loader is called, memoises one promise per path, forgets a failed load so a later call fetches again, and does not cache a load that settles after `dispose()`. `dispose()` frees every cached NPC geometry, material and texture exactly once. `preload()` still requests only cobra3, coriolis and buoy.
- `tests/app/asset-cache-npc.test.ts` pins the above with an injected loader (preload set, laziness and memoisation, seven refused path shapes with zero loader calls, failure forgetting with `cause`, dispose once-only, load-after-dispose not cached).
- `tests/e2e/budget.spec.ts` gains a same-origin request log. The cold-start test asserts the NPC set is 9 GLB and 43 texture paths (vacuity guard), that `models/cobra3.glb` appears in the log (the log is live), and that no NPC GLB or texture path is in it. `FIRST_LOAD_BYTES_CEILING` is unchanged at `9 * MIB`.
- `tests/e2e/npc-assets.spec.ts` fetches each of the nine GLBs from the preview build (200, magic `glTF`, version 2, declared length equals byte length), fetches every image they reference (43 unique), checks WebP or PNG signatures and decodes each through `createImageBitmap` with non-zero size.
- Measured cold-start transfer after Phase 9: **8,834,862 bytes** (ceiling 9,437,184, unchanged), recorded in `docs/PERFORMANCE.md`. It was 8,814,224 bytes on 2026-11-11.
- `CHANGELOG.md` `[Unreleased]` records the phase; `.planning/PROJECT.md` Key Decisions gains five rows (NPC content set, NPC record shape, `modelVendored` derivation, network vendoring exception, Phase 9 gate exception).

## Task Commits

1. **Task 1 (tracer): lazy NPC model loading in the asset cache** - `97bfa84` (feat)
2. **Task 2: cold-start request log and the on-demand NPC spec** - `961b40a` (test)
3. **Task 3: PERFORMANCE.md, CHANGELOG, five Key Decisions rows** - `2595bb7` (docs)
4. **Gate fix: explicit timeouts on the two emitTextures tests (deviation, see below)** - `e0747df` (test)

The ledger-measured `commits: 5` also counts `821fdd7` (`docs(09-01): record the orchestrator's checkpoint confirmation`), which was committed inside this plan's window but belongs to plan 09-01; this plan's own code and doc commits are the four above.

**Plan metadata:** the summary commit and the state/roadmap/requirements commit follow this file.

## Files Created/Modified

- `src/render/asset-cache.ts` - `loadNpcModel`, the NPC maps, the NPC branch of `dispose()`, extended ownership comment
- `tests/app/asset-cache-npc.test.ts` - Node unit test of the lazy loader (new)
- `tests/app/dispose.test.ts` - `guardCache` gains a rejecting `loadNpcModel` member
- `tests/e2e/budget.spec.ts` - cold-start request log and NPC absence assertions
- `tests/e2e/npc-assets.spec.ts` - on-demand fetch and decode of all NPC GLBs and images (new)
- `tools/oolite-ingest/convert/textures.test.ts` - explicit 180,000 ms timeouts on two tests
- `docs/PERFORMANCE.md` - Phase 9 cold-start row
- `CHANGELOG.md` - `[Unreleased]` `Added` entry
- `.planning/PROJECT.md` - five Key Decisions rows

## Decisions Made

- Followed the plan: no synchronous `npcModel` accessor (Phase 12 adds one only if its render path needs it).
- Key Decisions row d wording check: the plan text said "owner confirmation as recorded in 09-01-SUMMARY.md", but 09-01-SUMMARY.md records that the confirmation was made by the orchestrator on 2026-11-13 (independent re-run `checked=42 mismatches=0`) under the owner's overnight delegation. Row d in `.planning/PROJECT.md` claimed an owner confirmation, so it was corrected to say the confirmation was delegated to the orchestrator and cites the independent re-run (committed with the state update).

## Verification record

| Run | Command | Result |
| --- | --- | --- |
| verify run 1 | `docker compose run --rm verify` (log `/tmp/wegolite-09-05/verify.log`) | Failed: 138 passed / 1 failed files, 2538 passed / 2 failed tests. Only the two `emitTextures` tests in `tools/oolite-ingest/convert/textures.test.ts` failed, with `Test timed out in 5000ms` under full-suite load. They pass alone in about 1-2 s. |
| fix | `e0747df` | Explicit `180_000` ms timeouts on those two tests. Same pattern and fix as commit 07-12. No assertion weakened. |
| verify run 2 | `docker compose run --rm verify` (log `/tmp/wegolite-09-05/verify-run2.log`) | Fully green: lint, typecheck, `assets:check` "no differences", Vitest 139 files / 2540 passed / 2 skipped, `vite build`, e2e smoke subset 27 passed. |
| targeted | `budget.spec.ts` + `npc-assets.spec.ts` (`/tmp/wegolite-09-05/e2e-final.json`) | 4 passed. `first-load-bytes` annotation `8834862 bytes (ceiling 9437184)`, equal to the PERFORMANCE.md row. No NPC GLB (9) or NPC texture (43) requested at cold start; all 9 GLBs fetch and 43 images decode through `createImageBitmap`. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The two emitTextures tests time out at the 5 s default under full-suite load**
- **Found during:** Task 3 (verify run 1)
- **Issue:** `tools/oolite-ingest/convert/textures.test.ts` emissive bake tests ran past Vitest's default 5000 ms while 139 files competed for CPU, failing verify. This is a load-dependent timeout in a file this plan did not touch; both tests pass alone in about 1-2 s.
- **Fix:** Explicit `180_000` ms timeouts on the two tests, as plan 07-12 did for the same pattern. No assertion changed; the baked-texture byte ceiling is unchanged.
- **Files modified:** `tools/oolite-ingest/convert/textures.test.ts`
- **Verification:** verify run 2 green (2540 passed, 2 skipped).
- **Committed in:** `e0747df`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The gate needed it to pass; no scope creep, no production code touched.

## Issues Encountered

- Verify run 1 failed on the two timeouts described above; run 2 after the fix passed. Both runs are recorded here as required by the plan.
- Gate exception: per the owner's choice (recorded as Key Decisions row e), `verify` rather than `verify-full` was run for the render-folder change. `verify-full` has not been run for Phase 9.

## Requirement status

- **DATA-13:** complete (lazy loading, cold-start transfer 8,834,862 bytes under the unchanged 9,437,184 ceiling, on-demand fetch and decode).
- **DATA-10:** complete (already marked by 09-04; models and textures of the six populator roles compiled with provenance).
- **DATA-11:** stage 1 met (the record fields: roles, AI name, scan class, model). Not marked complete; the octree mass completes it in Phase 10.

## Known Stubs

None. `loadNpcModel` has no caller yet by design (Phase 12 is the first consumer); this is not a UI stub.

## Threat Flags

None. The only new surface is the path-guarded same-origin `loadNpcModel` (T-09-21, mitigated by `NPC_GLB_PATH_PATTERN` before any loader call) and no new origin is contacted (CSP `connect-src 'self'` unchanged).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 10 can add the octree mass to the NPC records (DATA-11 completion).
- Phase 12 is the first runtime caller of `loadNpcModel`; its change falls under the normal `verify-full` rule.
- Concern: the emissive bake tests are timing-sensitive under load; they now carry a 180 s timeout and may need a further look if the suite keeps growing.

## Self-Check: PASSED

- Files present: `src/render/asset-cache.ts`, `tests/app/asset-cache-npc.test.ts`, `tests/e2e/npc-assets.spec.ts`, `tests/e2e/budget.spec.ts`, `docs/PERFORMANCE.md`, `CHANGELOG.md`, `.planning/PROJECT.md`.
- Commits present in history: `97bfa84`, `961b40a`, `2595bb7`, `e0747df`.

---
*Phase: 09-npc-content*
*Completed: 2026-11-14*
