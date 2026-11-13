---
phase: 02-data-pipeline-content-compiler
plan: 04
subsystem: content-pipeline
tags:
  - dat
  - mesh
  - oolite
  - normals
  - winding
  - bounding-box
  - vendoring
  - sha256
  - determinism
  - docker

requires:
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 01's ContentError contract, canonical JSON/hash, manifest and assets service
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 02's hardened OpenStep parser and idempotent vendor script
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 03's committed generated tree, so assets:check has a stable baseline

provides:
  - five pinned .dat models vendored with CHECKSUMS rows and ASSETS.md provenance
  - parseDat() for the Cobra Mk III and four-part Coriolis, both separator dialects
  - Faces above three vertices warn and keep three; <3, truncated, oversized and non-finite input fail with located DAT_MESH
  - explicit/smooth/per-face normal selection, edge-vertex override, area-weighted smoothing
  - Oolite's per-component winding repair with the zero-normal flip and paired UV swap
  - boundingBox/assertBounds plus the five measured extent records
  - the five measured facts pinned by tests: 1548/1076, 48/50, 1140/1820, 42/26, 244/330 and 595 distinct Cobra normals

affects:
  - 02-05 shipdata catalogue
  - 02-06 GLB writer
  - 03 flight in the Lave system
  - 04 station approach and docking geometry

actuals:
  # chars/4 over the authored diff (51,931 bytes); the ~513 KB of vendored .dat
  # payload and CHECKSUMS are excluded: the estimate models authored work.
  tokens: 13000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - Oolite's preprocess is the parser's first step: strip //, replace every comma with a space, tokenise
    - One located DAT_MESH for every grammar, range and finiteness failure; warnings collected on the mesh, never console.warn
    - Winding repair mutates faces in place and returns the swap count for tests
    - Normalised surface normals computed once, with the per-component sign test kept for Oolite parity
    - Recorded extents compared relatively (1e-3), naming the file and axis on failure

key-files:
  created:
    - tools/oolite-ingest/convert/dat.ts
    - tools/oolite-ingest/convert/dat.test.ts
    - tests/fixtures/dat/quad-face.dat
    - tests/fixtures/dat/quad-face-comma.dat
    - tests/fixtures/dat/broken-truncated.dat
    - tests/fixtures/dat/face-underflow.dat
    - tests/fixtures/dat/oversize-nverts.dat
    - third_party/oolite/Models/oolite_cobra3.dat
    - third_party/oolite/Models/oolite_coriolis.dat
    - third_party/oolite/Models/oolite_coriolis_faceplate.dat
    - third_party/oolite/Models/oolite_coriolis_tris.dat
    - third_party/oolite/Models/oolite_coriolis_dock.dat
  modified:
    - scripts/vendor-oolite.sh
    - third_party/oolite/CHECKSUMS.sha256
    - ASSETS.md

key-decisions:
  - "FACES normals and NORMALS/TANGENTS vectors are normalised at parse time, exactly as Oolite does; the winding test keeps Oolite's per-component sign comparison rather than a dot product."
  - "normal_to_surface is normalised for the calculation: Oolite reads only the sign and stores its negation, so the normalised form is equivalent and yields a valid unit normal for a zero-normal face."
  - "A face wider than three vertices consumes all of its declared indices and the matching UV pairs before truncating to three; real data is triangles only, so this path exists for the fixture and for a future model."
  - "caseSensitiveNames is true exactly when a NAMES block is present: authored material names are identifiers, TEXTURES keys are filenames."
  - "MATERIALS are assigned in first-appearance order of the TEXTURES keys, and NAMES names overlay them by index (names[i] ?? key)."
  - "Every TEXTURES line's declared max_x/max_y divides the texels; all five models declare 1.0, so no pixel-size division can happen."

requirements-completed: [DATA-03, DATA-04]

coverage:
  - id: D1
    description: "The five pinned models are vendored from 7437f22 with one ASSETS.md provenance row and one CHECKSUMS row each; a second vendor run rewrites no byte."
    requirement: DATA-09
    verification:
      - kind: other
        ref: "docker compose run --rm assets sh scripts/vendor-oolite.sh twice; combined sha256 of third_party/oolite unchanged; 5 .dat files, 5 CHECKSUMS rows, 5 ASSETS rows"
        status: pass
    human_judgment: false
  - id: D2
    description: "parseDat reads NVERTS/NFACES/VERTEX/FACES/TEXTURES/NAMES/NORMALS/TANGENTS/END with the comma dialect, exact counts for all five files, per-face TEXTURES, material order, and a located DAT_MESH for <3 vertices, truncated sections, >200,000 counts and non-finite components."
    requirement: DATA-03
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/dat.test.ts#the five pinned meshes / the comma dialect and the four-vertex face / malformed meshes fail with a located DAT_MESH (10 tests)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check (no differences)"
        status: pass
    human_judgment: false
  - id: D3
    description: "explicit/smooth/per-face selection, the 1,548-entry/595-distinct Cobra NORMALS block, zero swaps on the four Coriolis meshes, the zero-normal flip plus winding swap, the paired UV swap, smooth repair before averaging, and all five bounding boxes with a named MESH_BOUNDS failure."
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/dat.test.ts#normal selection and winding repair / bounding boxes and texture coordinates (11 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Full repository verification is green and generation remains byte-stable: two assets builds change no byte in the generated tree or the snapshot."
    verification:
      - kind: integration
        ref: "docker compose run --rm verify (exit 0: lint, typecheck, assets:check, 114 unit tests, build, 2 Playwright)"
        status: pass
      - kind: other
        ref: "two consecutive docker compose run --rm assets; combined sha256 of src/content/generated + third_party/oolite unchanged"
        status: pass
    human_judgment: false

duration: 7 min
completed: 2026-11-03
status: complete

plan_head_before: 3f900a498877f9b97b9900f56fa8cef4bf58c748
plan_head_after: a716f91aa1ffc897810051d700274aebcf9c5867
commits: 5
---

# Phase 2 Plan 04: Mesh Parser, Winding Repair and Bounds Summary

**All five pinned meshes now parse into typed geometry with exact counts — the Cobra through its explicit 1,548-normal block and the four Coriolis parts through the comma dialect and per-face normals — with Oolite's winding repair, the 595-distinct-normal fact and all five bounding boxes pinned by tests.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-11-03T11:34:39Z
- **Completed:** 2026-11-03T11:41:57Z
- **Tasks:** 3
- **Files modified:** 15 (2 code/test, 5 fixtures, 5 vendored models, 3 provenance/config)

## Accomplishments

- The five models are vendored from the pinned snapshot with one `ASSETS.md` row and one `CHECKSUMS.sha256` row each; a second vendor run leaves the whole `third_party/oolite` tree byte-identical. No variant (`cobra3_redux.dat`, `cobra3_alt.dat`, `cobra3_pirate.dat`) was added, and no `.js` file entered `third_party`.
- `parseDat` preprocesses exactly as Oolite does — strip `//`, replace every `,` with a space, tokenise — so the Cobra's tabs and the Coriolis's commas reach the same grammar. The measured counts are asserted: 1,548/1,076, 48/50, 1,140/1,820, 42/26 and 244/330.
- The FACES line is decoded as `<smoothGroup r> <g> <b> <nx> <ny> <nz> <n_verts> <v0> <v1> <v2>` and TEXTURES as one line per face (`<materialKey> <max_x> <max_y>` plus three `(s,t)` pairs). The Cobra's material keys are `0`/`1` with `NAMES` `Gun`/`Hull`; each Coriolis part names its own `*_diffuse.png`.
- Failure is loud and located: a two-vertex face, a truncated `NFACES`, an `NVERTS` of 300,000 and a `NaN` coordinate each throw `DAT_MESH` naming the construct (the NaN case also names line 5). A four-vertex face warns, keeps three, and consumes its trailing index and UV pair so `END` is still found.
- Normal selection is `explicit → smooth → per-face`: the Cobra's `NORMALS` block wins even with `smooth = yes`, the Coriolis parts are per-face (or smooth when shipdata says so), and the Cobra's 1,548 authored normals resolve to exactly 595 distinct values.
- Winding repair runs for both legacy modes and swaps nothing on the 2,226 real Coriolis faces, which is the measured fact. Synthetic meshes prove the zero-normal face receives `+normalize(cross(v1-v0, v2-v0))` *and* a winding swap, that a disagreement swaps corner indices and UV pairs together, and that a smooth-mode repair happens before the area-weighted average.
- All five extents match to the recorded precision — Cobra `130 × 34.9649 × 81.3726`, Coriolis `1000 × 1000 × 995.918`, faceplate `1000 × 1000 × 41.369`, tris `1000 × 1000 × 995.918`, dock `103.4123 × 241.888 × 250` — and a mismatch throws `MESH_BOUNDS` naming the file and axis. Every UV stays in `[0,1]` and every declared texture size is `1.0 1.0`.
- `docker compose run --rm verify` is green end to end (114 unit tests, build, both Playwright cases), and two consecutive `assets` runs change no byte.

## Task Commits

Each task was committed atomically (Task 2 followed RED → GREEN):

1. **Task 1: vendor the five pinned meshes** — `06fb704` (feat)
2. **Task 2 RED: pin the mesh grammar and fixtures** — `787ee0c` (test)
3. **Task 2 GREEN: parse the grammar, comma dialect and truncation** — `565a36d` (feat)
4. **Task 3: prove normal modes, winding repair and bounds** — `69de432` (test)
5. **Follow-up: keep the determinism rule out of the parser comments** — `a716f91` (refactor)

**Plan metadata:** committed after this SUMMARY (docs).

## Files Created/Modified

- `tools/oolite-ingest/convert/dat.ts` — the parser and geometry helpers: `Vec3`, `Face`, `MeshMaterial`, `ParsedMesh`, `NormalMode`, `parseDat`, `selectNormalMode`, `repairWinding`, `resolveCornerNormals`, `boundingBox`, `assertBounds`, `MODEL_BOUNDS`, `materialName`.
- `tools/oolite-ingest/convert/dat.test.ts` — 21 tests across grammar, dialects, failure classes, normal modes, repair, bounds and UVs.
- `tests/fixtures/dat/*.dat` — quad face, comma variant, two-vertex face, truncated section, oversized `NVERTS`.
- `third_party/oolite/Models/*.dat` — the Cobra Mk III and four Coriolis parts, verbatim.
- `scripts/vendor-oolite.sh` — five `Models/` entries appended to the single `FILES` authority.
- `third_party/oolite/CHECKSUMS.sha256`, `ASSETS.md` — 5 new checksum rows and 5 new provenance rows, hashes written by the script.

## Decisions Made

- **Normalise stored normals at parse.** Oolite normalises both the FACES normal and the NORMALS/TANGENTS vectors; doing the same keeps `face.normal` a unit vector for the smooth weights and for the writer.
- **Normalise `normal_to_surface` for the repair.** Oolite's cross product is unnormalised, but only its sign is read; the normalised form is equivalent for the test and produces a valid unit normal when a zero-normal face is repaired.
- **Wide faces consume their full record.** A declared `n_verts > 3` reads all indices and the matching `(s,t)` pairs before keeping the first three. This is the only way the plan's four-pair fixture can still find `END`; every pinned face is a triangle.
- **`caseSensitiveNames` means "a NAMES block exists".** Authored names are identifiers; TEXTURES keys are filenames, so the flag records which namespace material names came from.
- **`repairWinding` returns the swap count.** The signature stays `(mesh, mode)`; the count is what lets the tests prove the zero-swap fact on the real Coriolis data.

## Deviations from Plan

### Process adaptations

**1. Task 3's production code shipped in Task 2's GREEN commit.**
- **Found during:** Task 3 planning
- **Issue:** `dat.ts` is one cohesive module; splitting normal resolution, repair and bounds out of the parser would have meant committing a deliberately incomplete module and then rewriting the same file.
- **Approach:** Task 2's GREEN commit (`565a36d`) contains the whole module; Task 3's commit (`69de432`) adds the 11 tests that prove the normal modes, repair and bounds. No behaviour was left unproven: every task-3 acceptance criterion is asserted.
- **Impact:** Commit granularity only; the implementation and its proof are both present.

**2. The Coriolis material-key test initially assumed one shared diffuse name.**
- **Found during:** Task 2 GREEN (`dat.test.ts`)
- **Issue:** The four parts each name their own texture (`oolite_coriolis_faceplate_diffuse.png`, `oolite_coriolis_dock_diffuse.png`, …), not a shared `oolite_coriolis_diffuse.png`.
- **Fix:** The assertion derives the expected key from the model filename instead of hardcoding one name.
- **Committed in:** `565a36d`

### Auto-fixed Issues

**3. [Rule 1 - Bug] Missing `ContentError` type import**
- **Found during:** Task 2 GREEN typecheck
- **Issue:** `datFailure` returns `ContentError`, but only `ContentErrorOptions` was imported; `tsc` reported TS2304.
- **Fix:** Added the type import.
- **Files modified:** `tools/oolite-ingest/convert/dat.ts`
- **Verification:** `docker compose run --rm typecheck` exits 0.
- **Committed in:** `565a36d`

**4. [Rule 1 - Bug] A determinism comment named a banned function**
- **Found during:** plan-level verification grep
- **Issue:** The `Math.sqrt` comment mentioned `Math.pow`, which made a grep for the banned transcendental functions look dirty.
- **Fix:** Reworded the comment; no code change.
- **Files modified:** `tools/oolite-ingest/convert/dat.ts`
- **Verification:** the determinism grep over `convert/dat.ts` returns nothing.
- **Committed in:** `a716f91`

---

**Total deviations:** 2 process adaptations + 2 auto-fixed (both Rule 1).
**Impact on plan:** No scope creep and no settlement weakened. The only production changes were an import and a comment; the process adaptation changed commit granularity, not coverage.

## Issues Encountered

- Lint and the full test suite must not run concurrently: `tests/guards/sim-purity.test.ts` seeds a temporary Three import into `src/sim`, and a parallel `eslint .` sees it and fails. Running `verify` (which chains them) and re-running lint alone both pass.
- Vendored `.dat` files are written by the container as root; they are read-only inputs from our side, so no permission workaround was needed.
- Vite still reports the pre-existing "chunks larger than 500 kB" advisory; unrelated to this plan.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- Plan 02-05 can add `shipdata.json` beside the existing converters; this plan emits no content, so `assets:check` stays a clean baseline.
- Plan 02-06 has the complete writer input: `vertices`, repaired `faces` with per-corner `uv`, `materials` in draw order, `normals`/`resolveCornerNormals`, and `MODEL_BOUNDS` for post-conversion assertions.
- The `explicit → smooth → per-face` table is executable; plan 05 should pass the coerced shipdata `smooth` flag into `selectNormalMode` rather than assuming per-face.
- Open item: `caseSensitiveNames` records the NAMES presence only; no consumer yet, so a later material-lookup rule can build on it without a content change.
- Open item: the wide-face UV consumption rule is exercised only by the fixture; the pinned corpus is all triangles.

---

## Self-Check: PASSED

- [x] All 3 tasks executed and committed (`06fb704`, `787ee0c`, `565a36d`, `69de432`, `a716f91`).
- [x] `third_party/oolite/Models` holds exactly five `.dat` files; `CHECKSUMS.sha256` and `ASSETS.md` each name all five.
- [x] `dat.test.ts` passes 21 tests; the full suite passes 114.
- [x] `docker compose run --rm typecheck` and `lint` exit 0.
- [x] `docker compose run --rm assets npm run assets:check` reports no differences; two builds change no byte.
- [x] `docker compose run --rm verify` exits 0 (lint, typecheck, assets:check, 114 tests, build, 2 Playwright).
- [x] `grep -n "parseFloat\|parseInt" tools/oolite-ingest/convert/dat.ts` returns nothing; `grep -rn "computeVertexNormals" tools/` returns nothing.
- [x] Five commits exist on this branch.

*Phase: 02-data-pipeline-content-compiler*
*Completed: 2026-11-03*
