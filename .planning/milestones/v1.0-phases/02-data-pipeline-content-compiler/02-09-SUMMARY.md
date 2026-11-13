---
phase: 02-data-pipeline-content-compiler
plan: 09
subsystem: content-pipeline
tags:
  - content-boundary
  - manifest-validation
  - zod
  - eslint
  - provenance
  - sha256
  - licensing
  - docker

requires:
  - phase: 02-data-pipeline-content-compiler
    provides: Plans 01-08's ingest pipeline, generated content tree, drift gate and determinism guards
  - phase: 01-foundation
    provides: The sim purity zone, the withProbe harness and the SPDX/compliance walk this plan extends

provides:
  - A type-only src/content surface (types.ts) the simulation may import without zod or generated data
  - A runtime manifest schema and assertContentManifest() that throws ContentBoundaryError at boot
  - An ESLint sim-zone denial of content/index*, content/schemas/** and content/generated/**, with a three-probe proof
  - tests/compliance-assets.test.ts, a vacuity-guarded per-file ASSETS.md/CHECKSUMS.sha256 walk
  - README content-pipeline documentation and complete public/ provenance rows

affects:
  - Phase 3+ (the sim now has one typed door into content and no runtime door)
  - Phase 5 UI (consumes typed content; the manifest assertion already guards boot)
  - Any future src/content runtime module (must be added to the sim-zone deny group)

actuals:
  # chars/4 over the 24,373 added bytes in this plan's production/docs diff.
  tokens: 6093
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - A type-only re-export surface (`export type … from`) is the one door a pure module may use; the schema stays the single source of truth
    - A runtime boundary validates only the declaration (manifest), not the records, because records were validated at build time
    - A rule is only credible with both a negative proof and a positive proof: the deny must fire, and the allowed door must still pass
    - A provenance claim needs a vacuity guard, because a broken walk passes every assertion about an empty list

key-files:
  created:
    - src/content/schemas/manifest.ts
    - src/content/index.ts
    - src/content/types.ts
    - src/content/index.test.ts
    - tests/guards/content-boundary.test.ts
    - tests/compliance-assets.test.ts
  modified:
    - src/main.ts
    - tsconfig.json
    - eslint.config.js
    - README.md
    - ASSETS.md

key-decisions:
  - "The action's export was followed: index.ts exports CONTENT_MANIFEST_SCHEMA_VERSION, not the artifacts list's CONTENT_MANIFEST_URL; the app imports the JSON directly, so a URL constant would be unused and untested."
  - "The manifest schema is strict and pins schemaVersion 1 and the format literal, so a version or format mismatch stops the boot instead of being coerced."
  - "assertContentManifest names the zod issue path in bracket form (`files[3].sha256`) and the expected value, so a failure identifies the artefact rather than printing 'invalid manifest'."
  - "The sim-zone deny list is exactly the plan's three runtime paths (index, schemas, generated); any future runtime module under src/content/ must be added to that group, because the group is not a blanket negation."
  - "The 16 verbatim public/textures copies gained ASSETS.md rows: they are committed Oolite-derived assets, and ASSETS.md's own rule requires a row even though the compliance walk only proves third_party/."

patterns-established:
  - "Type-only door: a re-export module of `export type … from` schema modules, proven by grep, the sim typecheck and a positive lint probe."
  - "Path-naming boundary error: a zod safeParse failure is rendered as path plus expected value, wrapped in a named Error with `cause`."
  - "Three-source provenance: filesystem walk = ASSETS.md rows = CHECKSUMS.sha256, with the checksum file's own row proven only by ASSETS.md."

requirements-completed: [DATA-07, DATA-08, DATA-09]

coverage:
  - id: D1
    description: "src/content exposes a type-only surface (types.ts) and a runtime manifest assertion (index.ts) that accepts the committed manifest and throws a path-naming ContentBoundaryError on a wrong schemaVersion, an unknown format, or a missing file-row hash; main.ts asserts it before the renderer exists."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "src/content/index.test.ts (4 tests: committed manifest accepted; schemaVersion 2, format \"other\" and a missing files[3].sha256 each rejected with the path)"
        status: pass
      - kind: other
        ref: "docker compose run --rm typecheck (tsconfig.json + tsconfig.sim.json)"
        status: pass
      - kind: other
        ref: "docker compose run --rm app npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "The src/sim ESLint zone denies content/index*, content/schemas/** and content/generated/** with the 'src/sim may only import src/sim and content/types' message; the type-only import still passes ESLint and tsconfig.sim.json."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tests/guards/content-boundary.test.ts (3 tests: content/index.js and content/schemas/system.js fail no-restricted-imports; the type-only probe passes both gates)"
        status: pass
      - kind: other
        ref: "docker compose run --rm lint (exit 0; git status --porcelain src/sim empty after the probes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every file under third_party/oolite/ has exactly one ASSETS.md row with a matching SHA-256, no row names a missing file, CHECKSUMS.sha256 agrees with the walk excluding its own row, and the walk fails on an empty or partial list."
    requirement: DATA-09
    verification:
      - kind: unit
        ref: "tests/compliance-assets.test.ts (8 tests: vacuity guard, one row per file, SHA-256 equality, no orphans, checksum set/hash equality, CHECKSUMS' own row, header/sentence, no vendored .js)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm verify (assets:check third; lint, typecheck, 189 unit tests, build, 3 Playwright tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "README documents the content pipeline end to end: the pinned release/commit, regeneration, the assets:check drift gate inside verify, no hand-editing, the bump procedure, the cross-architecture proof and the CC BY-NC-SA 3.0 terms."
    requirement: DATA-08
    verification:
      - kind: other
        ref: "grep -n 'Content pipeline' / 'assets:check' / '7437f22' / 'check-arch-determinism' README.md"
        status: pass
    human_judgment: true
    rationale: "The required anchors are asserted by grep, but whether the prose is complete and clear enough for a new contributor is a review judgment."

duration: 5 min
completed: 2026-11-03
status: complete

plan_head_before: 12193f31bdc06781b22d7498a4c11895795f6ab5
plan_head_after: e6bd75a942612d4abca559d139a55b46b868995e
commits: 4
---

# Phase 2 Plan 09: Content Boundary Summary

**A type-only content door for the simulation, a boot-time manifest assertion that names the failing path, a proven ESLint denial of runtime content imports, and a three-source provenance walk over every vendored byte — closing Phase 2 as a contract rather than a pipeline that merely ran.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-03T12:44:44Z
- **Completed:** 2026-11-03T12:49:54Z
- **Tasks:** 3
- **Files modified:** 12 (6 created, 5 modified, plus the RED evidence record)

## Accomplishments

- **The sim gets one typed door and no runtime door.** `src/content/types.ts` is `export type … from` only, re-exporting `Commodity`, `System`, `SystemChunk`, `Equipment`, `Labels`, `CatalogEntry`, `ShipCatalogue`, `ContentManifest` and `ManifestFileEntry`. A probe importing `System` from a `src/sim` file passes both ESLint and `tsconfig.sim.json`; probes importing `content/index.js` or `content/schemas/system.js` fail `no-restricted-imports` with the boundary message.
- **The app validates exactly one thing, loudly.** `ContentManifestSchema` pins `format`, `schemaVersion: 1`, the Oolite `{release, commit, retrieved}` pin and every `files[]` row (with a 64-hex SHA-256). `assertContentManifest` runs in `main.ts` before the renderer exists and throws `ContentBoundaryError` naming `schemaVersion`, `format` or `files[3].sha256` and the expected value; the committed manifest passes it, so the shipped app boots with content matching its own declaration.
- **Every vendored byte is provenanced three ways.** `tests/compliance-assets.test.ts` walks all 65 files under `third_party/oolite/`, fails first if the walk finds fewer than 60 (vacuity guard), then asserts exactly one `ASSETS.md` row per file with the actual SHA-256, no row naming a missing file, and agreement with `CHECKSUMS.sha256` on the set excluding its own row. The checksum file's own provenance is proven by its `ASSETS.md` row.
- **The public copies are no longer a provenance gap.** `ASSETS.md` gains the 16 verbatim `public/textures` copies, each naming its `third_party/oolite/Textures` source and SHA-256. The generated GLBs and five baked emissive maps already had rows.
- **The pipeline is documented as a contract.** README now names the pinned `1.93.1-241` / `7437f22` snapshot, regeneration, the `assets:check` drift gate as the third stage of `verify`, the never-hand-edit rule, the bump procedure, `scripts/check-arch-determinism.sh` and the CC BY-NC-SA 3.0 terms.
- **The gates genuinely hold.** `docker compose run --rm verify` exits 0 (189 unit tests, 3 Playwright), `typecheck` passes both projects, two consecutive `docker compose run --rm assets` runs change no byte, and no probe survives the suite.

## Task Commits

Task 1 followed RED → GREEN (plan-level `type: execute`, task-level `tdd="true"`):

1. **Task 1 RED: pin the manifest boundary contract** — `3616a9d` (test)
2. **Task 1 GREEN: assert the content manifest at boot and expose type-only content** — `fe6a8ee` (feat)
3. **Task 2: deny runtime content imports from the sim and prove it** — `831921f` (feat)
4. **Task 3: prove every vendored byte and document the content pipeline** — `e6bd75a` (docs)

**Plan metadata:** committed after this SUMMARY (docs).

RED evidence: `docker compose run --rm test npx vitest run --reporter=tap src/content/index.test.ts` exited 1 with 4/4 discovered tests failing inside the not-implemented `assertContentManifest` stub or on the planned diagnostic assertion. `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`, format `tap`). Record: `.planning/phases/02-data-pipeline-content-compiler/02-09-red.json`.

## Files Created/Modified

- `src/content/schemas/manifest.ts` — strict `ContentManifestSchema` / `ManifestFileEntrySchema`; `z.infer` exports.
- `src/content/index.ts` — `ContentBoundaryError`, `CONTENT_MANIFEST_SCHEMA_VERSION` and `assertContentManifest` with path-and-expected diagnostics.
- `src/content/types.ts` — type-only re-exports; no runtime import, no `export const`, no zod value import.
- `src/content/index.test.ts` — four boundary cases against the committed manifest.
- `src/main.ts` — imports the manifest, asserts it before the renderer, and logs the pinned snapshot.
- `tsconfig.json` — `resolveJsonModule: true` (the only compiler change).
- `eslint.config.js` — the sim zone gains `content/index*`, `content/schemas/**` and `content/generated/**`; `ignores` stays four entries.
- `tests/guards/content-boundary.test.ts` — two negative probes and one positive type-only probe, removed in `finally`.
- `tests/compliance-assets.test.ts` — the vacuity-guarded provenance walk across the filesystem, `ASSETS.md` and `CHECKSUMS.sha256`.
- `README.md` — the Content pipeline section plus an updated repository layout.
- `ASSETS.md` — 16 `public/textures` vendored-copy rows with source and SHA-256.
- `.planning/phases/02-data-pipeline-content-compiler/02-09-red.json` — the RED evidence record.

## Decisions Made

- **Followed the task action's `CONTENT_MANIFEST_SCHEMA_VERSION` export.** The artifacts list also named `CONTENT_MANIFEST_URL`, but the app imports the JSON directly, so a URL constant would be unused and untested; the version constant is what the schema's literal represents.
- **Strict schema for our own output.** `format` and `schemaVersion` are literals and objects are `z.strictObject`, so a leaked field or a version mismatch stops the boot instead of being ignored. Raw Oolite dictionaries remain open elsewhere; this one is Wegolite's declaration.
- **Bracket paths in the diagnostic.** `files[3].sha256` is what a reader can grep in the manifest; a dotted `files.3.sha256` would be ambiguous about array indices.
- **The deny group is exactly the plan's three runtime paths.** `content/systems.js` is not in it, so a future runtime module must be added deliberately; the group is not a blanket negation because a negation risks re-allowing a path the plan did not intend.
- **Public copies were added to ASSETS.md.** The compliance test walks only `third_party/`, but the repository's provenance rule covers every committed Oolite-derived asset, and the plan's flagged-assumption table explicitly leaves `public/` to review plus the `ASSETS.md` edit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The 16 verbatim public texture copies had no provenance rows**

- **Found during:** Task 3 (the provenance audit before adding the walk)
- **Issue:** `ASSETS.md` recorded the two generated GLBs and the five baked emissive PNGs, but the 16 PNGs copied verbatim from `third_party/oolite/Textures/` into `public/textures/` had no rows of their own. `ASSETS.md`'s first sentence says no asset may be committed without a row, so this was a licensing/provenance gap even though the originals are recorded.
- **Fix:** Added one `vendored-copy` row per public PNG, naming the exact `third_party/oolite/Textures/` source and its SHA-256 (identical bytes).
- **Files modified:** `ASSETS.md`
- **Verification:** every added row's SHA-256 matches the committed file and the manifest; the third_party walk still passes; the eight-column header and the "No asset may be committed" sentence are unchanged.
- **Committed in:** `e6bd75a` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical).
**Impact on plan:** Provenance completeness only; no code path, schema or generated byte changed. The compliance test still scopes its walk to `third_party/` exactly as the plan specifies, and the `public/` rows are proven by the manifest hashes and review.

## Issues Encountered

- **Prettier reformatted four new files after the first lint run.** The changes were formatting-only; the test file's formatting was folded into the Task 1 GREEN commit by amending it, and the Task 3 test file was formatted before its commit.
- **No source change was needed for `resolveJsonModule`.** The default JSON import typechecked under `verbatimModuleSyntax` and `moduleResolution: bundler`; `tsconfig.sim.json` inherits the flag but imports no JSON, so the DOM-free project is unaffected.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- Phase 2's contract is closed: the simulation has a typed, runtime-free content surface; the app fails loudly on a manifest mismatch; every vendored byte has a checksum and a provenance row; and the regenerated tree is byte-stable.
- The deny group is deliberately the plan's three runtime paths. A future module under `src/content/` (beyond `types.ts`) must be added to the sim zone in the same change that introduces it, or the "only content/types" message becomes untrue for that module.
- The cross-architecture byte-identity measurement remains outstanding on this host (no arm64 execution); `scripts/check-arch-determinism.sh` records that honestly and the arm64 CI runner is where it settles.
- `docker compose run --rm verify` is green: lint, typecheck, `assets:check` (no differences), 189 unit tests, build, 3 Playwright tests.

---

*Phase: 02-data-pipeline-content-compiler*
*Completed: 2026-11-03*

## Self-Check: PASSED

- [x] All 3 tasks executed; Task 1 followed RED (`3616a9d`) → GREEN (`fe6a8ee`).
- [x] `src/content/types.ts` is type-only: grep finds no `export const`, no `require(` and no zod value import; a `src/sim` probe importing `System` with `import type` passes `tsc -p tsconfig.sim.json --noEmit`.
- [x] `assertContentManifest` accepts the committed manifest and throws `ContentBoundaryError` naming `schemaVersion`/expected `1`, `format`, and `files[3].sha256`.
- [x] `src/main.ts` asserts the manifest before the renderer exists and logs the pinned commit.
- [x] Probes importing `content/index.js` and `content/schemas/system.js` from `src/sim` fail lint with `no-restricted-imports` and the content/types message; `git status --porcelain src/sim` is empty after the suite.
- [x] `tests/compliance-assets.test.ts` finds 65 vendored files (guard ≥60), one matching `ASSETS.md` row each, no orphan rows, and `CHECKSUMS.sha256` agrees on all 64 non-self rows; `CHECKSUMS.sha256` itself has a row.
- [x] README contains `Content pipeline`, `assets:check`, `7437f22` and `check-arch-determinism`.
- [x] `docker compose run --rm verify` exits 0 (189 unit tests, 3 Playwright tests, `assets:check` no differences).
- [x] Two consecutive `docker compose run --rm assets` runs changed no byte (`git status --porcelain src/content/generated public` empty).
