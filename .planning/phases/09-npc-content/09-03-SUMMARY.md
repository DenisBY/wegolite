---
phase: 09-npc-content
plan: 03
subsystem: content
tags: [oolite, glb, converter, npc-ships, textures, provenance, catalogue]
status: complete
requires:
  - phase: 09-npc-content
    provides: "09-02 generic buildShipGlb path, NPC_SHIP_GLBS table and the table-driven NPC GLB test block"
provides:
  - "public/models/{adder,cobramk1,gecko,krait,mamba,moray,shuttle,sidewinder}.glb"
  - "31 WebP textures and 9 baked emissive maps for the eight ships"
  - "VENDORED_MODEL_FILES derived from MODEL_SOURCE_FILES (16 .dat files); 32 usable catalogue entries carry modelVendored"
affects: [09-04, 09-05]
plan_head_before: 9acae20048e8f7d843b6718ded7bd8ebc4c43b35
plan_head_after: cf43c62fd32d821c194066e22a35f97181650efd
actuals:
  tokens: 30000
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "one derived list (MODEL_SOURCE_FILES) feeds both the converter and the catalogue modelVendored flag"
key-files:
  created:
    - public/models/adder.glb
    - public/models/cobramk1.glb
    - public/models/gecko.glb
    - public/models/krait.glb
    - public/models/mamba.glb
    - public/models/moray.glb
    - public/models/shuttle.glb
    - public/models/sidewinder.glb
  modified:
    - tools/oolite-ingest/convert/glb.ts
    - tools/oolite-ingest/convert/dat.ts
    - tools/oolite-ingest/convert/textures.ts
    - tools/oolite-ingest/convert/textures.test.ts
    - tools/oolite-ingest/convert/texture-encode.test.ts
    - tools/oolite-ingest/convert/ships.ts
    - tools/oolite-ingest/convert/ships.test.ts
    - tests/golden/content/ships.json
    - ASSETS.md
    - src/content/generated/ships.json
    - src/content/generated/texture-encodings.json
    - src/content/generated/manifest.json
key-decisions:
  - "modelVendored has one source: VENDORED_MODEL_FILES is the sorted union of MODEL_SOURCE_FILES, so the buoy and every NPC model user are marked vendored without a second hand-kept list."
requirements-completed: [DATA-10]
coverage:
  - id: D1
    description: "All nine NPC role ship GLBs, 33 WebP textures and 10 emissive maps are emitted from the vendored snapshot and assets:check regenerates them byte-identical"
    requirement: DATA-10
    verification:
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check -> no differences (after both commits)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each new GLB row is pinned by bytes, node count, material and texture closure and MODEL_BOUNDS span; the texture closure holds in both directions for 54 names; 19 near-lossless normals, 14 alpha speculars, 16 emissive maps"
    requirement: DATA-10
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#NPC ship GLBs, textures.test.ts, texture-encode.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every new public file has one ASSETS.md row with its SHA-256 and licence (86 public rows)"
    requirement: DATA-10
    verification:
      - kind: unit
        ref: "tests/compliance-assets.test.ts, tests/compliance.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "modelVendored derives from the converted-model list; 32 usable entries are vendored, pinned by the catalogue golden and a count assertion; ships-client.json is unchanged"
    requirement: DATA-10
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/ships.test.ts, tests/content/ships-client.test.ts"
        status: pass
    human_judgment: false
---

# Phase 9 Plan 03: The remaining eight NPC role ships Summary

The converter now compiles all nine NPC role ships (adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper) from table rows, and `modelVendored` is derived from `MODEL_SOURCE_FILES` instead of a second hand-kept list.

## Run record

| Item | Value |
| --- | --- |
| PLAN_BASE | `9acae20048e8f7d843b6718ded7bd8ebc4c43b35` |
| Plan head after | `cf43c62fd32d821c194066e22a35f97181650efd` |
| Tasks | 2 (Task 1 tracer, Task 2 auto; both autonomous) |
| Completed | 2026-11-13 |

## Task commits

| Task | Commit | Result |
| --- | --- | --- |
| 1 (tracer) Eight role ships end to end | `eb0062a` | 8 GLBs, 31 WebP, 9 emissive PNGs, 48 ASSETS.md rows, 54-name texture pins |
| 2 One source for modelVendored | `cf43c62` | derived `VENDORED_MODEL_FILES`, 32-key golden, regenerated ships.json |

## Bytes added under public/

The 48 new manifest rows add 12,136,737 bytes (public/ total 8,765,436 -> 20,902,173 bytes). All 48 files are served lazily; nothing is on the first-load path (verified in plan 09-05).

## MODEL_BOUNDS

Every row went in exactly as planned; the build raised no `MESH_BOUNDS`, so no model was re-measured.

## Reviewed ships.json diff

Only `modelVendored` changed: 47 values flipped from false to true (25 usable entries, taking the usable vendored total from 7 to 32, plus 22 template or sub-entity entries that share a converted model). No other field changed, the entry count stays 194, and `ships-client.json` is byte-identical to PLAN_BASE.

## Verification (all in Docker)

- `assets:check`: `no differences` after each task.
- `vitest run tools/oolite-ingest tests/compliance-assets.test.ts tests/compliance.test.ts tests/content/ships-client.test.ts`: 17 files, 336 tests passed (verbose run of Task 1: 16 files, 329 tests, 17 verbose lines matching the NPC `.glb is pinned` pattern, covering all nine rows).
- `lint` and `typecheck`: pass.
- Acceptance counts: GLBs in manifest 12; `texture-encodings.json` 54 files; `manifest.json` 101 files; `ASSETS.md` public rows 86; guard `rg --files public` for python / variant / interceptor names prints nothing; `cobra3`, `coriolis`, `buoy`, `viper` GLBs byte-identical to PLAN_BASE; usable and vendored entries 32 (golden 32, `jq length` 194).
- `verify` and `verify-full` were not run (owner gate policy for plans 01-04).

## Deviations from Plan

**1. [Style] ASSETS.md rows follow the existing block grouping**
- As in plan 09-02, the 48 rows were merged in code-unit order inside each existing group (models, baked emissive PNGs, nebula copies, WebP files) rather than into one globally sorted block. `tests/compliance-assets.test.ts` accepts this.
- Files: `ASSETS.md`. Commit `eb0062a`.

**2. [Wording] Stale counts removed from comments**
- The `ships.ts` module header no longer states "95 of the 102" and the `ships.test.ts` header and golden test titles no longer state a count, as the plan asked; the 32-key list and the 16-file assertion carry the numbers.
- Commit `cf43c62`.

**Total deviations:** 2, both cosmetic. **Impact:** none on build output or gates.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema; T-09-11 to T-09-14 mitigations in place (rows script copies SHA-256 from the manifest and the compliance test checks them against disk; mesh and texture bounds checks ran before conversion; the ships.json diff changed only `modelVendored`; the explicit lists and both-direction closure keep out-of-scope assets out).

## Notes for later plans

- No `CHANGELOG.md` entry: nothing user-visible until a later plan loads these models.
- The ASSETS.md rows script lives only in `/tmp/wegolite-09-03/rows.mjs` (scratch, not in the repository).

## Self-Check: PASSED

- All eight GLBs, 31 WebP files and 9 emissive PNGs exist on disk and in the manifest: FOUND.
- Commits `eb0062a` and `cf43c62` are ancestors of HEAD: FOUND.
- Plan-level verification (assets:check, Vitest, lint, typecheck): PASSED.
