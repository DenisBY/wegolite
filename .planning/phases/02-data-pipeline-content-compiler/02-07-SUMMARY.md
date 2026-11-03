---
phase: 02-data-pipeline-content-compiler
plan: 07
subsystem: content-pipeline
tags:
  - textures
  - png
  - emissive
  - zlib
  - determinism
  - provenance
  - uv-orientation
  - playwright

requires:
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 01's canonical JSON/hash, manifest, drift gate and assets service
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 05's resolved shipdata catalogue with materials
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 06's EMITTED_ENTRIES, materialFor and the two committed GLBs

provides:
  - VENDORED_TEXTURES and the 16-name texture allowlist
  - resolveReferencedTextures() driven by EMITTED_ENTRIES, asserted in both directions
  - copyTextures() with path containment and a SHA-256 source/output equality check
  - decodePng()/decodeGreyscalePng() limited to 8-bit non-interlaced RGBA/greyscale, 8192 max
  - encodeGreyscalePng() with filter 0, explicit zlib parameters and an integer CRC table
  - bakeEmissive() and emitTextures() producing the five _emissive.png maps
  - sampleNearest() and the 8x8 asymmetric fixture that settle the V orientation

affects:
  - 03 flight (Cobra textures now resolve through ../textures/ and the emissive map)
  - 04 station approach (the four Coriolis parts have their own copied and baked maps)
  - 08 cross-arch determinism probe (this plan's zlib output is the architecture-sensitive artefact)
  - 07 compression work (the 18.8 MiB verbatim set is now committed)

actuals:
  # chars/4 over the authored textual diff (114,817 bytes), excluding the
  # 37 committed binary textures and the generated manifest.
  tokens: 28704
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - The texture set is derived from EMITTED_ENTRIES, never restated, so GLB URIs and copied files cannot drift apart
    - Copying is hash-verified: a transform on the copy path fails the build instead of shipping a different image
    - PNG headers are validated before inflate, so a decompression bomb cannot allocate
    - The emissive naming rule is one exported function shared by materialFor and the bake
    - The drift gate scans public/textures beside generated JSON and public/models

key-files:
  created:
    - tools/oolite-ingest/convert/textures.ts
    - tools/oolite-ingest/convert/textures.test.ts
    - tests/fixtures/textures/asymmetric-8x8.png
    - third_party/oolite/Textures/*.png (16)
    - public/textures/*.png (16 copied + 5 baked)
  modified:
    - scripts/vendor-oolite.sh
    - third_party/oolite/CHECKSUMS.sha256
    - tools/oolite-ingest/generate.ts
    - tools/oolite-ingest/cli.ts
    - tools/oolite-ingest/drift.test.ts
    - tools/oolite-ingest/convert/glb.ts
    - tests/e2e/models.spec.ts
    - src/content/generated/manifest.json
    - ASSETS.md
    - NOTICE

key-decisions:
  - "The 16-name allowlist is explicit and asserted in both directions; cobra3-alternate and cobra3-pirate are excluded because no GLB is built from them, so _alt/_pirate never leak into the set."
  - "decodePng accepts only non-interlaced 8-bit colour-type-6 images and decodes greyscale separately; decodeGreyscalePng exists so the bake is verified through a header-limited path rather than by re-parsing in the test."
  - "The emissive filename rule moved to one exported emissiveFile() in glb.ts; the bake imports it, so a baked file and an emitted emissiveTexture URI cannot disagree."
  - "PNG decode does not verify chunk CRCs. Every source is a hash-pinned vendored byte and the only encoder is ours; a CRC failure would be caught earlier by the vendor checksum or the copy hash."
  - "The asymmetric fixture confirms identity: v = 0 is the image's top row, so convertMesh keeps the authored UV pair and no V flip is applied anywhere."
  - "Textures are emitted only after the closure succeeds, so a missing or traversing name fails before a single byte is read."

requirements-completed: [DATA-04, DATA-07, DATA-08, DATA-09]

coverage:
  - id: D1
    description: "The texture closure equals the 16 files the two GLBs reference in both directions; every reference is copied byte-for-byte with a SHA-256 equality assertion, and missing or traversing names fail with TEXTURE_MISSING naming ship, material and snapshot path."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/textures.test.ts#texture reference closure (5 tests) and #copyTextures (2 tests)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check (no differences; 21 public/textures rows in the manifest)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The PNG codec rejects 16-bit, interlaced and oversized headers before inflating; the bake emits colour type 0 with filter 0 on every scanline and grey equal to the source alpha (6,224 non-zero pixels on the Coriolis diffuse)."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/textures.test.ts#decodePng (4 tests) and #bakeEmissive (2 tests)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/models.spec.ts#the preview serves both GLBs and the Coriolis graph reads correctly (every images[].uri fetched, 200 and PNG signature)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Exactly five greyscale emissive files are emitted, their names equal the GLBs' emissiveTexture URIs in both directions, each Coriolis material and the Cobra Hull point at their own baked file, the Cobra Gun has none, and two consecutive builds are byte-identical."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/textures.test.ts#emitTextures (2 tests, including the committed byte-for-byte check)"
        status: pass
      - kind: integration
        ref: "two consecutive docker compose run --rm assets; sha256sum public/textures/*_emissive.png identical"
        status: pass
      - kind: integration
        ref: "docker compose run --rm verify (exit 0: lint, typecheck, assets:check, 169 unit tests, build, 3 Playwright)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 8x8 asymmetric fixture proves v = 0 is the image's top row and the emitted UV (0,0) sits on the geometry's top-left corner, so the converter deliberately applies no V flip."
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/textures.test.ts#sampleNearest (V orientation) (2 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every vendored PNG has a CC BY-NC-SA 3.0 provenance row with a computed SHA-256, every baked emissive has a generated-asset row, and NOTICE states that both are derivative CC BY-NC-SA 3.0 works rather than GPL."
    requirement: DATA-09
    verification:
      - kind: integration
        ref: "scripts/vendor-oolite.sh refuses a vendored path without an ASSETS.md row and fills every digest"
        status: pass
    human_judgment: true
    rationale: "The row's licence, origin and modification wording is a licensing judgement no test asserts; the checksum and row presence are enforced, but the provenance prose needs human review."

duration: 10 min
completed: 2026-11-03
status: complete

plan_head_before: e55044bdc1bbf683e0b14e0fae00f7798e06209a
plan_head_after: 104e0e1
commits: 4
---

# Phase 2 Plan 07: Vendored Textures and the Greyscale Emissive Bake Summary

**The two GLBs' texture references now resolve to 16 byte-identical vendored PNGs, and the alpha-channel emissive masks are baked by an in-repo `node:zlib` PNG codec as five byte-stable greyscale files — with a 21-file drift gate and a fixture proving no V flip.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-11-03T12:22:44Z
- **Completed:** 2026-11-03T12:32:39Z
- **Tasks:** 3
- **Files modified:** 50 (37 binary textures, 13 authored/wiring/provenance files)

## Accomplishments

- **The texture set is the GLBs' reference set.** `resolveReferencedTextures` walks only the entries named by `EMITTED_ENTRIES` — `cobra3-player` and the four Coriolis owners — collects every `diffuse_map`, `normal_map`, `specular_map`, `emission_map.name` and the `.png` material key used as a diffuse fallback, and asserts set equality with `VENDORED_TEXTURES` in both directions. The 16 names resolve; `oolite_cobra3_diffuse_alt.png` and `_pirate.png` are absent from the closure and from both trees.
- **Copying is literal and checked.** `copyTextures` resolves each path under `third_party/oolite/Textures`, refuses an escape, writes the same bytes to `public/textures`, then re-reads and compares SHA-256. A missing file fails with `TEXTURE_MISSING` naming the ship, material and expected snapshot path — never a placeholder.
- **A small PNG codec, no image dependency.** `decodePng` reads `IHDR` first: non-interlaced 8-bit colour type 6 only, dimensions capped at 8192, all checked before `inflateSync`. `encodeGreyscalePng` writes colour type 0 with filter 0 on every scanline, an integer CRC-32 table, and explicit `level: 9`, `Z_FIXED`, `memLevel: 9`, `windowBits: 15`. The Coriolis diffuse decodes to 512² RGBA with exactly the measured 6,224 non-zero alpha pixels.
- **Five emissive maps, one naming rule.** `emitTextures` derives the distinct emission sources, bakes each with `bakeEmissive`, and writes `oolite_{cobra3,coriolis,coriolis_faceplate,coriolis_tris,coriolis_dock}_diffuse_emissive.png`. The test reads the committed GLBs and proves the baked set equals their `emissiveTexture` URIs in both directions, the Cobra Gun has none, and two bakes share a SHA-256. The five outputs measure 8.5 KB–380 KB.
- **The V orientation is decided, not assumed.** The committed 8×8 fixture has four distinct quadrants and an opaque-red top-left. `sampleNearest(fixture, 0.25, 0.25)` is red and `(0.25, 0.75)` is blue, while the emitted quad's geometric top-left carries UV `(0, 0)` and its bottom-left `(0, 1)`: identity, no flip, recorded in one place.
- **The drift gate covers the new root.** `public/textures` joined `EMITTED_ROOTS`, `drift.test.ts` copies it into its throwaway tree, and the manifest hashes all 21 files. Two consecutive `assets` runs leave the emissive digests unchanged.

## Task Commits

Task 2 followed RED → GREEN; the other two tasks are single commits.

1. **Task 1: vendor and copy the referenced texture set** — `d0b3fbd` (feat)
2. **Task 2 RED: pin the PNG caps, the emissive bake and the five-file set** — `429c973` (test)
3. **Task 2 GREEN: bake the greyscale emissive maps** — `d69b126` (feat)
4. **Task 3: settle the V orientation with the asymmetric fixture** — `104e0e1` (feat)

**Plan metadata:** committed after this SUMMARY (docs).

RED evidence: `docker compose run --rm test npx vitest run --reporter=tap tools/oolite-ingest/convert/textures.test.ts` exited 1 with the `decodePng`, `bakeEmissive` and `emitTextures` groups failing inside the not-implemented guard; the closure and copy groups passed.

## Files Created/Modified

- `tools/oolite-ingest/convert/textures.ts` — `VENDORED_TEXTURES`, `resolveReferencedTextures`, `copyTextures`, `decodePng`, `decodeGreyscalePng`, `encodeGreyscalePng`, `bakeEmissive`, `sampleNearest`, `emitTextures`, `MAX_TEXTURE_DIMENSION`.
- `tools/oolite-ingest/convert/textures.test.ts` — 17 tests across the closure, copies, decode caps, bake/emit and the orientation fixture.
- `tools/oolite-ingest/convert/glb.ts` — exports `emissiveFile` (one naming rule) and records the resolved identity orientation in the header.
- `tools/oolite-ingest/generate.ts` — copies textures and emits the emissive maps after the JSON/GLB pass.
- `tools/oolite-ingest/cli.ts`, `tools/oolite-ingest/drift.test.ts` — scan and copy `public/textures`.
- `scripts/vendor-oolite.sh` — 16 texture paths appended; all downloads still byte-verbatim.
- `third_party/oolite/Textures/*.png`, `CHECKSUMS.sha256`, `ASSETS.md` — 16 vendored files with provenance rows and computed digests.
- `public/textures/*.png` — 16 verbatim copies plus 5 baked emissive maps, all in the manifest.
- `tests/fixtures/textures/asymmetric-8x8.png` — 82-byte four-quadrant fixture.
- `tests/e2e/models.spec.ts` — fetches every GLB image URI and asserts 200 plus the PNG signature.
- `NOTICE` — the derivative-work sentence extended from GLBs to the baked PNGs and copied sources.

## Decisions Made

- **The allowlist is explicit and two-directional.** A referenced-but-unvendored name and an allowlisted-but-unreferenced name both fail. That is what keeps the variant `_alt`/`_pirate` maps out without a special case.
- **Greyscale decoding is a separate function.** `decodePng` must reject colour type 0, so `decodeGreyscalePng` exists to validate the encoder's output without weakening that contract.
- **The naming rule is shared, not duplicated.** `emissiveFile` is exported from `glb.ts` and imported by the bake, so the GLB's `emissiveTexture` URI and the written file cannot drift.
- **Chunk CRCs are not re-verified on decode.** The sources are hash-pinned vendored bytes and the copy path re-hashes them; the decoder's job is shape validation and unfiltering.
- **No V flip.** The fixture proves identity; `convertMesh`'s UV copy stays the authored pair.

## Deviations from Plan

### Auto-fixed / process adaptations

**1. [Rule 3 - Blocking] The drift gate could not see `public/textures`**
- **Found during:** Task 1
- **Issue:** `EMITTED_ROOTS` in `cli.ts` scanned only `src/content/generated` and `public/models`, so a copied or baked texture could drift without `assets:check` noticing — contrary to the plan's must-have that `assets:check` covers all of them.
- **Fix:** Added `EMITTED_TEXTURES_DIR` to `EMITTED_ROOTS` and copied `public/textures` into `drift.test.ts`'s throwaway tree.
- **Files modified:** `tools/oolite-ingest/cli.ts`, `tools/oolite-ingest/drift.test.ts`
- **Verification:** `assets:check` green twice; the drift suite's six cases still pass.
- **Committed in:** `d0b3fbd`

**2. [Rule 2 - Missing Critical] One emissive naming rule instead of two copies**
- **Found during:** Task 2
- **Issue:** `glb.ts` had a private `emissiveFile` and the bake needed the same `<base>_emissive.png` suffix; duplicating the rule is the exact drift the plan warns about.
- **Fix:** Exported `emissiveFile` from `glb.ts` and imported it in the bake, leaving the emitted GLB bytes unchanged.
- **Files modified:** `tools/oolite-ingest/convert/glb.ts`, `tools/oolite-ingest/convert/textures.ts`
- **Verification:** both GLBs regenerate byte-identically; `assets:check` reports no differences; the e2e URI set still matches.
- **Committed in:** `d69b126`

**3. [Rule 3 - Blocking] `emitTextures` was handed the catalogue object, not its entries**
- **Found during:** Task 2 GREEN, first `assets` run
- **Issue:** `compileShips` returns `{ entries, ... }`; passing the whole result made `resolveReferencedTextures` call `.map` on a non-array.
- **Fix:** `generate.ts` passes `catalogue.entries`.
- **Files modified:** `tools/oolite-ingest/generate.ts`
- **Verification:** `assets` writes 36 files and `assets:check` is green.
- **Committed in:** `d69b126`

**4. [Rule 3 - Blocking] The V-orientation decision was recorded in `glb.ts` too**
- **Found during:** Task 3
- **Issue:** The plan names `textures.ts` as the module header, but the flip's single home is `convertMesh` in `glb.ts`; the old header still said the decision was open.
- **Fix:** Recorded the confirmed identity in both headers (comment-only in `glb.ts`).
- **Files modified:** `tools/oolite-ingest/convert/textures.ts`, `tools/oolite-ingest/convert/glb.ts`
- **Verification:** comments only; `typecheck`, `lint`, `assets:check` and `verify` green.
- **Committed in:** `104e0e1`

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking, 1 Rule 3 documentation, 1 Rule 2 critical).
**Impact on plan:** No scope change. Deviation 1 is required for the plan's own drift-coverage claim; deviation 2 removes a duplication the plan explicitly warns against.

## Issues Encountered

- The Cobra `Hull` material also carries an `emission_map`; the closure therefore records both `diffuse` and `emission` references for `oolite_cobra3_diffuse.png`, and that file is one of the five baked sources. The initial test expectation counted only the diffuse reference and was corrected against the measured material data.
- `public/textures` adds ~19 MiB to both the working tree and each drift-test copy. The six drift cases still run in about five seconds; no optimisation was needed.

## User Setup Required

None — no external service configuration. The one network step (`docker compose run --rm assets sh scripts/vendor-oolite.sh`) was run once, deliberately, and its output is committed.

## Next Phase Readiness

- Plan 08's cross-architecture probe now has the artefact it exists for: `public/textures/*_emissive.png` are the only zlib-compressed outputs, and their SHA-256s are stable across consecutive builds on this host.
- Phase 3 can render the Cobra with its real maps: five copied maps plus `oolite_cobra3_diffuse_emissive.png`, and `extras.oolite` still carries the authored values.
- Phase 4's Coriolis composite has all four parts' diffuse/normal/specular maps and four distinct emissive maps; the dock's maps are copied.
- The ~18.8 MiB verbatim set is committed and drift-checked; KTX2/Meshopt compression stays deferred to Phase 7 by D-20.
- Open item: the source PNGs' gamma/channel metadata is preserved verbatim but not interpreted by the pipeline; look-dev in Phase 7 owns colour-space decisions.

---

*Phase: 02-data-pipeline-content-compiler*
*Completed: 2026-11-03*

## Self-Check: PASSED

- [x] All 3 tasks executed and committed (`d0b3fbd`, `429c973`, `d69b126`, `104e0e1`).
- [x] `resolveReferencedTextures` yields exactly 16 names and `VENDORED_TEXTURES` matches in both directions.
- [x] All 16 vendored PNGs exist, are byte-identical to their copied counterparts, and have ASSETS.md rows with computed SHA-256s.
- [x] `oolite_cobra3_diffuse_alt.png` and `_pirate.png` are absent from both trees and the closure.
- [x] Five `_emissive.png` files exist; their set equals the GLBs' emissive URIs; two builds hash identically.
- [x] `ls public/textures | wc -l` = 21; the manifest holds 21 texture rows.
- [x] `docker compose run --rm verify` exits 0 (169 unit tests, 3 Playwright).
- [x] `grep -rn "pngjs\|sharp\|canvas" package.json tools/oolite-ingest/` returns nothing.
- [x] `grep -rnE "Math\.(random|sin|cos|tan|exp|log|pow)|Date\.now|new Date|localeCompare|toFixed|Intl\.|eval\(|new Function" tools/oolite-ingest/convert/textures.ts` returns nothing.
