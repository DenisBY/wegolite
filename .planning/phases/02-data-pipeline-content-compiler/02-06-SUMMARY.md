---
phase: 02-data-pipeline-content-compiler
plan: 06
subsystem: content-pipeline
tags:
  - glb
  - gltf
  - cobra3
  - coriolis
  - winding
  - normals
  - uvs
  - materials
  - determinism
  - playwright

requires:
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 01's canonical JSON/hash, manifest, drift gate and assets service
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 04's parseDat/selectNormalMode/repairWinding/resolveCornerNormals and the five vendored .dat meshes
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 05's resolved shipdata catalogue with materials, subentities and the keyed dock

provides:
  - writeGlb() - an in-repo deterministic GLB container with a fixed generator string
  - convertMesh() - material-first layout, authored corner order, one Z negation at the boundary
  - materialFor() - metallic-roughness projection with every authored value under extras.oolite
  - buildCobraGlb() / buildCoriolisGlb() / emitModels() driven by EMITTED_ENTRIES
  - public/models/cobra3.glb (119,816 B) and public/models/coriolis.glb (248,448 B)
  - ship-bounds.json pinning source/converted bounds, the 12-face corner-dot baseline and the UV sign baseline
  - tests/e2e/models.spec.ts proving the preview delivery path in Chromium

affects:
  - 02-07 textures (imports EMITTED_ENTRIES for the texture closure and the emissive bake)
  - 03 flight (loads cobra3.glb; extras.oolite for look-dev)
  - 04 station approach (coriolis.glb's four nodes and the dock at z = -500.2561)

actuals:
  # chars/4 over the realized textual diff (139,093 bytes); the two committed
  # GLBs are excluded because the estimate models authored work.
  tokens: 34773
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - The GLB container is authored, never delegated - a dependency's generator string would re-baseline every committed binary
    - A reflection (det = -1) plus the authored corner order is already glTF CCW; a second winding repair would double-flip
    - Accessor min/max are read back from the float32 buffer that is written, so a bound cannot drift from its data
    - Every generated artefact class lives in one declared root list (generated JSON, public/models) that the drift gate scans
    - -0 is normalised to 0 in the converted buffer so a bound compares equal to the JSON that records it

key-files:
  created:
    - tools/oolite-ingest/convert/glb.ts
    - tools/oolite-ingest/convert/glb.test.ts
    - tests/golden/content/ship-bounds.json
    - tests/e2e/models.spec.ts
    - public/models/cobra3.glb
    - public/models/coriolis.glb
  modified:
    - tools/oolite-ingest/generate.ts
    - tools/oolite-ingest/cli.ts
    - tools/oolite-ingest/convert/ships.ts
    - tools/oolite-ingest/drift.test.ts
    - src/content/generated/manifest.json
    - ASSETS.md
    - NOTICE

key-decisions:
  - "The Coriolis GLB's specular map is carried by KHR_materials_specular, because core glTF has no specular slot; extras.oolite.specular_map keeps the authored name beside it."
  - "NodeIO.readBinary refuses any GLB with external image URIs by design, and D-20 keeps the textures as separate files, so the reader is fed the file's own JSON and BIN plus zero-length image payloads through readJSON; the refusal itself is asserted so the textures cannot silently become embedded."
  - "The golden records the writer's float32-exact converted bounds rather than rounded doubles, so the assertion is toEqual with no tolerance and the golden is literally generated from the writer."
  - "Converted z is normalised so -0 becomes 0: numerically identical, but a -0 bound would not compare equal to the 0 the accessor records and would put a needless 0x80000000 in the buffer."
  - "The converter's UV pair is the authored one divided only by max_x/max_y; the 1 - v decision is plan 07's asymmetric-PNG fixture, and the flip has exactly one home (the UV copy in convertMesh)."
  - "emitModels emits both binaries, so task 1's commit carries coriolis.glb as well: the manifest hashes both and a generated binary must never sit untracked."

requirements-completed: [DATA-04, DATA-07, DATA-08]

coverage:
  - id: D1
    description: "A byte-deterministic GLB container: magic 0x46546C67, version 2, declared length equal to the byte length, JSON chunk padded with 0x20 and BIN with 0x00, generator fixed at wegolite-oolite-ingest/1, and two consecutive builds producing identical bytes and SHA-256."
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#writes the glTF header, the two 4-byte aligned chunks and their padding"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#emits the same bytes twice, and the same SHA-256"
        status: pass
      - kind: integration
        ref: "two consecutive docker compose run --rm assets; combined sha256 of src/content/generated + public/models = 23bb21e6c2675885618d472c574770546ac69f7aca19e1b57640e0b6c32bf0b0 both runs"
        status: pass
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check (no differences, twice)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Cobra Mk III converts with one primitive per authored material (Gun then Hull), one vertex per face corner with a sequential index buffer, and every emitted triangle fronting Oolite's converted normal; the 12 near-perpendicular authored-normal faces match the committed baseline within 1e-4 and the other 1,064 are positive on every corner."
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#emits one vertex per face corner, with a sequential index buffer"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#keeps the authored corner order so every face fronts Oolite's converted normal"
        status: pass
      - kind: integration
        ref: "tools/oolite-ingest/convert/glb.test.ts#round-trips through the independent reader with one mesh and two primitives (accessor min/max equal the written data)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Coriolis composite is one GLB with four nodes and four meshes selected by subentity_key, the dock at exactly [0, 0, -500.2561], each part textured from its own owning shipdata entry, and all 2,226 faces fronting their converted normal."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#emits the four-part Coriolis composite with its own local transforms"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#pins every Coriolis node's converted bounds against the golden"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#fronts Oolite's converted normal on all 2,226 Coriolis faces"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#draws each Coriolis part's material set from its own owning entry"
        status: pass
    human_judgment: false
  - id: D4
    description: "Materials are approximate metallic-roughness (metalness 0, roughness clamp(1 - gloss, 0.04, 1)) with textures referenced as ../textures/<file>.png, the diffuse falling back to a .png material key, the emissive pointing at the baked _emissive name, no alphaMode for the Coriolis, and the full authored values under extras.oolite including the raw emission_modulate_color dictionary and its /255 triple."
    requirement: DATA-07
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#resolves every Cobra material texture against the measured map names"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#draws each Coriolis part's material set from its own owning entry"
        status: pass
    human_judgment: false
  - id: D5
    description: "UVs are emitted per face corner exactly as parsed (divided only by the declared 1.0/1.0 scale, never by a pixel size) and stay in the closed unit square; the signed-area baseline is pinned in glTF texture space (Cobra 383 positive / 687 negative / 6 zero-area, dock 330/330 negative, all 14 mouth faces negative)."
    requirement: DATA-04
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#pins the emitted UV handedness in glTF texture space"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/convert/glb.test.ts#keeps every UV inside the unit square and divides only by the declared scale"
        status: pass
    human_judgment: false
  - id: D6
    description: "Both GLBs ship over the real preview path: a Chromium fetches models/cobra3.glb and models/coriolis.glb, reads the header and JSON chunk, and finds four Coriolis nodes with the dock at [0, 0, -500.2561], four meshes and materials, two Cobra materials and two primitives, and every image URI resolving under /textures/."
    requirement: DATA-08
    verification:
      - kind: e2e
        ref: "tests/e2e/models.spec.ts#the preview serves both GLBs and the Coriolis graph reads correctly (Playwright, docker compose run --rm e2e)"
        status: pass
      - kind: integration
        ref: "docker compose run --rm verify (exit 0: lint, typecheck, assets:check, 152 unit tests, build, 3 Playwright)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The visual letterbox check: looking through the converted Coriolis dock opening must read correctly rather than mirrored, with the faceplate sitting proud of the hull."
    verification: []
    human_judgment: true
    rationale: "Whether a letterbox reads mirrored is a visual judgement no assertion in this plan makes; the geometry and UV signs are pinned, but the human eye is the instrument the check exists for. Deferred to end-of-phase verification (workflow.human_verify_mode = end-of-phase)."

duration: 21 min
completed: 2026-11-03
status: complete

plan_head_before: b677486da28d79669b00ab4dbf7e3d13a33069f8
plan_head_after: 03eb0f7ff41a2762c5d1749ca7d88e0a1419284c
commits: 4
---

# Phase 2 Plan 06: Deterministic GLB Writer for the Cobra Mk III and the Coriolis Composite Summary

**Both ship models now compile to byte-identical GLBs from our own container — the Cobra as two material primitives with its authored 1,548-normal block, the Coriolis as four nodes with the dock at `z = -500.2561` — with every emitted triangle proven to front Oolite's converted normal, 12 measured near-perpendicular faces pinned by baseline, and the full authored material values carried under `extras.oolite`.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-11-03T12:58:00+01:00
- **Completed:** 2026-11-03T13:19:30+01:00
- **Tasks:** 3
- **Files modified:** 14 (5 authored code/test, 1 golden, 1 e2e spec, 2 committed binaries, 2 provenance, 3 wiring)

## Accomplishments

- **The container is ours, byte for byte.** `writeGlb` assembles `header(12) | JSON chunk | BIN chunk` from a fixed insertion order, pads the JSON with `0x20` and the BIN with `0x00`, writes `asset.generator = "wegolite-oolite-ingest/1"`, and reaches for neither a clock nor a locale nor a library version. Two consecutive `docker compose run --rm assets` runs produce the identical combined digest `23bb21e6…c32bf0b0` over `src/content/generated` + `public/models`.
- **The conversion is proven, not conventional.** Negating Z is a reflection (`det = -1`) and Oolite stores the negation of the authored-order right-hand normal, so the *authored* corner order after reflection is already glTF counter-clockwise. The test asserts `dot(normalize(cross(p1-p0, p2-p0)), M * ooliteFaceNormal) = +1` on all 1,076 Cobra and all 2,226 Coriolis faces — it would be `-1` on every one of them if the corners were reversed. No winding repair runs after the conversion.
- **The corner-normal baseline is a measured table, not a tolerance.** 1,064 Cobra faces have a positive dot on every corner; the 12 faces whose authored explicit normal sits just past perpendicular reproduce the committed values (`-0.0009`, `-0.0218`, …, worst `-0.1727`) within `1e-4`, and a failure names the face index and its dot.
- **Layout mirrors Oolite's own loader.** Materials first, faces second, corners third, one vertex per corner, no dedup: the Cobra emits 2,490 Hull vertices + 738 Gun vertices with `0,1,2,…` indices, so a primitive maps 1:1 to Oolite's `triangle_range[mi]` and the draw order is the author's.
- **The Coriolis is one file, four nodes.** `hull`, `faceplate`, `tris` and `dock` are selected from the resolved `coriolis-station` subentities by `subentity_key` (never by index, never "the fourth" of the 17 entries), each keeps its authored transform, and the dock's `+500.2561` becomes `[0, 0, -500.2561]`. Converted z ranges land exactly where the research measured them: hull `[-495.918, 500]`, dock local `[0, 250]`, Cobra `[-43.4655, 37.9071]`.
- **Each part draws its own materials.** Hull from `coriolis-station`, faceplate/tris/dock from their own entries, with the diffuse falling back to the `.png` material key exactly where Oolite authors it that way. The base-colour set is asserted as four distinct URIs, so a regression that passes one `shipDef` for all four fails loudly.
- **Materials stay reversible.** `metalness` 0, `roughness = clamp(1 - gloss, 0.04, 1)` (Cobra Hull 0.2, Coriolis hull 0.04), textures referenced as `../textures/<file>.png` rather than embedded, the emissive pointing at `_emissive.png` (never the RGBA diffuse), no `alphaMode` for the Coriolis, and `extras.oolite` carrying `gloss`, `shininess`, `specular_color`, the raw `emission_modulate_color` dictionary `{red: 6750.952, green: 6780.963, blue: 3280.8824}` plus its `/255` triple `[26.474, 26.592, 12.866]`.
- **The drift gate covers binaries.** `assets:check` now scans `public/models` alongside `src/content/generated`, and `drift.test.ts` gained a case that flips one byte of `cobra3.glb` and asserts the report names it. A generated binary is an artefact like any JSON.
- **The delivery path is proven in a browser.** `tests/e2e/models.spec.ts` fetches both GLBs over `vite preview`, parses the header and JSON chunk in page JS, and asserts the Coriolis graph and dock translation there — the failure mode `NodeIO` cannot see (a GLB missing from `dist/`, or a relative URL that only works from the repository).

## Task Commits

Task 1 followed RED → GREEN (plan-level `type: execute`, task-level `tdd="true"`):

1. **Task 1 RED: pin the GLB container, winding and material contract** — `6cbd7d9` (test)
2. **Task 1 GREEN: write a deterministic GLB for the Cobra Mk III** — `a2b529f` (feat)
3. **Task 2: convert the Coriolis composite and pin the converted bounds** — `9509954` (feat)
4. **Task 3: pin the UV handedness and prove the browser delivery path** — `03eb0f7` (test)

**Plan metadata:** committed after this SUMMARY (docs).

RED evidence: `docker compose run --rm test npx vitest run --reporter=tap tools/oolite-ingest/convert/glb.test.ts` exited 1 with 6/6 discovered tests `not ok`, each failing inside the function under test (`writeGlb`/`convertMesh`/`materialFor`/`buildCobraGlb` threw the not-implemented guard). `gsd_run check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`, format `tap`). Record: `.planning/phases/02-data-pipeline-content-compiler/02-06-red.json`.

## Files Created/Modified

- `tools/oolite-ingest/convert/glb.ts` — `writeGlb`, `convertMesh`, `materialFor`, `buildCobraGlb`, `buildCoriolisGlb`, `emitModels`, `assertConvertedBounds`, `EMITTED_ENTRIES`, `MODEL_SOURCE_FILES`, `GLB_GENERATOR` and the GLB/extras types.
- `tools/oolite-ingest/convert/glb.test.ts` — 12 tests: container framing, byte identity, the independent reader, layout/no-dedup, folding + the 12-face baseline, Cobra materials, the four-node composite, converted bounds, 2,226 front-face dots, the four material sets, UV handedness, UV integrity.
- `tests/golden/content/ship-bounds.json` — versioned: `uvBasis`, the Cobra source/converted bounds, `cornerNormalDots`, `uvSigns`, and the four Coriolis nodes with their translations, bounds, dock `uvSigns` and `mouthFaces`.
- `tests/e2e/models.spec.ts` — the preview delivery path in Chromium.
- `tools/oolite-ingest/generate.ts` — parses the five `.dat` files (asserting the recorded extents first), compiles the catalogue once, emits the ships JSON and both GLBs through `emitModels`.
- `tools/oolite-ingest/cli.ts` — `EMITTED_ROOTS` so the drift gate scans `public/models` as well as the generated JSON tree.
- `tools/oolite-ingest/convert/ships.ts` — `emitShipsFromCatalogue`, so `generate.ts` compiles the catalogue once instead of twice.
- `tools/oolite-ingest/drift.test.ts` — copies `public/models` into the throwaway tree and adds the mutated-GLB case.
- `public/models/cobra3.glb` (119,816 B), `public/models/coriolis.glb` (248,448 B), `src/content/generated/manifest.json` — the binaries and their hashed rows.
- `ASSETS.md`, `NOTICE` — `generated-asset` rows with SHA-256 and the derivative-licence sentence.

## Decisions Made

- **Specular goes through `KHR_materials_specular`.** Core glTF has no specular slot; the standard extension carries the texture and `extras.oolite.specular_map` keeps the authored name. The dock authors no specular map at all, so it has no extension.
- **The independent reader is fed the file's own JSON and BIN.** `NodeIO.readBinary` refuses any GLB whose images are external URIs, and D-20 requires external textures. The test therefore reads through `readJSON` with the same JSON, the same BIN and zero-length image payloads — nothing is re-serialised — and separately asserts that `readBinary` still *rejects* the file, which is the proof that the textures stayed external.
- **The golden stores float32-exact converted bounds.** `-43.46549987792969` rather than `-43.4655`, so the assertion is `toEqual` with no tolerance and the golden is literally what the writer produces (which is also what "generated from the writer" asked for).
- **`-0` is normalised to `0` in the converted buffer.** Numerically identical, but the float32 bytes differ and a `-0` bound would not compare equal to the `0` the accessor's JSON records.
- **The UV handoff is explicit.** The emitted `(u, v)` is the authored pair divided only by `max_x`/`max_y` (1.0 on all five models); whether `v` needs `1 - v` is plan 07's asymmetric-PNG fixture, and if so the flip has exactly one home — the UV copy in `convertMesh` — as recorded in the module header.

## Deviations from Plan

### Auto-fixed / process adaptations

**1. [Rule 1 - Conflict] `NodeIO.readBinary` cannot accept a GLB with external textures**
- **Found during:** Task 1 GREEN
- **Issue:** The plan's must-have says "`@gltf-transform/core`'s `NodeIO.readBinary` accepts every emitted GLB". `PlatformIO.binaryToJSON` throws `Cannot resolve external images with binaryToJSON()` for any GLB whose images are URIs, unconditionally — and D-20 requires the textures to stay separate files rather than embedded.
- **Fix:** The reader still validates the bytes, but through `readJSON` with the file's own JSON and BIN chunks plus zero-length image payloads (nothing is re-serialised by us). The rejection is asserted as a test so the textures cannot silently become embedded, and the material graph, accessors, min/max and mesh/primitive structure are all still checked by a reader the writer does not share code with.
- **Files modified:** `tools/oolite-ingest/convert/glb.test.ts`
- **Verification:** 12/12 tests pass; the refusal assertion fails if the images ever gain a bufferView.
- **Committed in:** `a2b529f`

**2. [Rule 3 - Blocking] The drift gate could not see `public/models`**
- **Found during:** Task 1 GREEN
- **Issue:** `compareTrees` scanned only `src/content/generated`, so a drifted GLB was invisible to `assets:check` — and `drift.test.ts`'s copy of the tree would have reported the new binaries as `MISSING`.
- **Fix:** Introduced `EMITTED_ROOTS` (generated JSON + `public/models`), copied both roots in the drift harness, and added a negative proof that one flipped byte of `cobra3.glb` is named as `CHANGED bytes`.
- **Files modified:** `tools/oolite-ingest/cli.ts`, `tools/oolite-ingest/drift.test.ts`
- **Verification:** `assets:check` green twice; the new drift case passes.
- **Committed in:** `a2b529f`

**3. [Rule 1 - Bug] A `-0` bound did not compare equal to the accessor's recorded `0`**
- **Found during:** Task 2
- **Issue:** Negating a zero Z produced `-0` in the buffer while `JSON.stringify` recorded `0` in `min`, so the reader's computed bound (from the data) was `-0` and `toEqual` distinguished it from the golden's `0`.
- **Fix:** `negate()` maps both zeros to `+0`, which removes a needless `0x80000000` per zero component as well.
- **Files modified:** `tools/oolite-ingest/convert/glb.ts`
- **Verification:** the four-node bounds test passes on all four nodes; regeneration and `assets:check` stay byte-stable.
- **Committed in:** `9509954`

**4. Commit granularity: `coriolis.glb` ships in task 1's commit.**
- **Found during:** Task 1 GREEN
- **Issue:** `emitModels` produces both binaries and the manifest hashes both, so task 1's commit could not contain a coherent manifest without them, and a generated binary must never sit untracked.
- **Approach:** Both GLBs and the manifest land in `a2b529f`; task 2 adds the Coriolis *tests*, the golden half and the ASSETS row, so nothing shipped unproven (its structure is asserted by task 2's four tests and by the Chromium case).
- **Impact:** Commit granularity only.

---

**Total deviations:** 3 auto-fixed (2 Rule 1, 1 Rule 3) + 1 granularity adaptation.
**Impact on plan:** No functional scope change. Deviation 1 is the only substantive one: it records a real, permanent constraint of the chosen reader, and the replacement path checks strictly more than `readBinary` could while asserting the constraint itself.

## Issues Encountered

- The specular extension triggers `Missing optional extension, "KHR_materials_specular"` warnings on stderr whenever the test reads a GLB. It is a log line, not a failure, and it is the expected consequence of using a standard extension `@gltf-transform/core` alone does not implement.
- `tests/golden/content/ship-bounds.json` initially recorded rounded doubles (`-43.4655`) while the accessor carries float32 (`-43.46549987792969`); the golden was regenerated from the writer rather than loosening the assertion to a tolerance.
- Adding the `generated-asset` kind widened the `Kind` column of `ASSETS.md`, so Prettier re-padded the whole table — a whitespace-only diff that `prettier --check` requires.

## Human Check (deferred to end-of-phase)

`workflow.human_verify_mode` is `end-of-phase`, so this is not a mid-flight checkpoint. Outstanding, recorded for phase verification:

> Open `public/models/coriolis.glb` in a glTF viewer (or the preview once Phase 3 loads it) and look through the dock opening: the letterbox must read correctly, not mirrored, and the faceplate must sit proud of the hull.

Everything automatable around it is green: the dock's 330/330 UV signed areas are negative in the pinned glTF basis, all 14 mouth faces share that sign, the faceplate's converted z range `[-534.298, -492.929]` stands outside the hull's `[-495.918, 500]`, and the browser case confirms the emitted dock translation is `[0, 0, -500.2561]`.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- Plan 07 imports `EMITTED_ENTRIES` and `MODEL_SOURCE_FILES` from `convert/glb.ts` for the texture closure rather than restating them, and bakes exactly `<emission_map.name basename>_emissive.png` per distinct emission map — the GLBs already reference those names.
- Plan 07 owns two open edges this plan deliberately left: the PNGs are not vendored yet, so every `images[].uri` currently dangles (`../textures/<file>.png`), and the pixel-sampling asymmetric fixture that decides on `1 - v` belongs with the PNG decoder.
- Phase 3 can load `public/models/cobra3.glb` directly: two primitives, front-facing, with the 595-distinct authored normal block intact and `extras.oolite` available for look-dev.
- Phase 4 gets the composite as four nodes with real local transforms and the dock mouth at `z = -500.2561`; the letterbox orientation is the one visual item still unconfirmed.
- Open item: `public/models/*.glb` are written by the container as `root`, like the generated JSON. That is the existing convention for generator output and needs no permission workaround.

---

*Phase: 02-data-pipeline-content-compiler*
*Completed: 2026-11-03*

## Self-Check: PASSED

- [x] All 3 tasks executed and committed (`6cbd7d9` RED, `a2b529f`, `9509954`, `03eb0f7`).
- [x] `writeGlb`, `convertMesh`, `materialFor`, `buildCobraGlb`, `buildCoriolisGlb` and `emitModels` exist in `tools/oolite-ingest/convert/glb.ts`.
- [x] `public/models/cobra3.glb` (119,816 B) and `public/models/coriolis.glb` (248,448 B) both begin with `glTF`, declare version 2 and declare their own byte length.
- [x] Two consecutive `docker compose run --rm assets` runs produce the identical combined digest `23bb21e6c2675885618d472c574770546ac69f7aca19e1b57640e0b6c32bf0b0`.
- [x] `docker compose run --rm assets npm run assets:check` exits 0 with no differences.
- [x] `docker compose run --rm verify` exits 0 (lint, typecheck, assets:check, 152 unit tests, build, 3 Playwright).
- [x] `docker compose run --rm e2e` passes 3 tests including `tests/e2e/models.spec.ts`.
- [x] `grep -rn "gltf-transform" tools/oolite-ingest/convert/glb.ts` returns nothing.
- [x] `grep -rn "Date\|Math.random\|toFixed\|os.arch" tools/oolite-ingest/convert/glb.ts` returns nothing.
- [x] Every file named in `key-files.created` exists on disk and every task commit is an ancestor of HEAD.
