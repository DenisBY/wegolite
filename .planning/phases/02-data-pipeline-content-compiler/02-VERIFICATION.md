---
phase: 02-data-pipeline-content-compiler
verified: 2026-11-03T13:16:17Z
status: human_needed
score: "4/5"
covered_files:
  - ".planning/phases/02-data-pipeline-content-compiler/02-01-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-01-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-02-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-02-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-03-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-03-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-04-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-04-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-05-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-05-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-06-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-06-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-07-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-07-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-08-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-08-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-09-PLAN.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-09-SUMMARY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-REVIEW-DISPOSITION.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-REVIEW.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-SECURITY.md"
  - ".planning/phases/02-data-pipeline-content-compiler/02-VALIDATION.md"
  - ".prettierignore"
  - "AGENTS.md"
  - "ASSETS.md"
  - "NOTICE"
  - "README.md"
  - "compose.yaml"
  - "eslint.config.js"
  - "package-lock.json"
  - "package.json"
  - "public/models/cobra3.glb"
  - "public/models/coriolis.glb"
  - "public/textures/oolite_cobra3_diffuse.png"
  - "public/textures/oolite_cobra3_diffuse_emissive.png"
  - "public/textures/oolite_cobra3_normal.png"
  - "public/textures/oolite_cobra3_specular.png"
  - "public/textures/oolite_cobra3_subents.png"
  - "public/textures/oolite_cobra3_subents_normal.png"
  - "public/textures/oolite_coriolis_diffuse.png"
  - "public/textures/oolite_coriolis_diffuse_emissive.png"
  - "public/textures/oolite_coriolis_dock_diffuse.png"
  - "public/textures/oolite_coriolis_dock_diffuse_emissive.png"
  - "public/textures/oolite_coriolis_dock_normal.png"
  - "public/textures/oolite_coriolis_faceplate_diffuse.png"
  - "public/textures/oolite_coriolis_faceplate_diffuse_emissive.png"
  - "public/textures/oolite_coriolis_faceplate_normal.png"
  - "public/textures/oolite_coriolis_faceplate_specular.png"
  - "public/textures/oolite_coriolis_normal.png"
  - "public/textures/oolite_coriolis_specular.png"
  - "public/textures/oolite_coriolis_tris_diffuse.png"
  - "public/textures/oolite_coriolis_tris_diffuse_emissive.png"
  - "public/textures/oolite_coriolis_tris_normal.png"
  - "public/textures/oolite_coriolis_tris_specular.png"
  - "scripts/check-arch-determinism.sh"
  - "scripts/vendor-oolite.sh"
  - "src/content/generated/commodities.json"
  - "src/content/generated/equipment.json"
  - "src/content/generated/labels.json"
  - "src/content/generated/manifest.json"
  - "src/content/generated/ships.json"
  - "src/content/generated/systems/g0.json"
  - "src/content/generated/systems/g1.json"
  - "src/content/generated/systems/g2.json"
  - "src/content/generated/systems/g3.json"
  - "src/content/generated/systems/g4.json"
  - "src/content/generated/systems/g5.json"
  - "src/content/generated/systems/g6.json"
  - "src/content/generated/systems/g7.json"
  - "src/content/index.test.ts"
  - "src/content/index.ts"
  - "src/content/schemas/commodity.ts"
  - "src/content/schemas/equipment.ts"
  - "src/content/schemas/labels.ts"
  - "src/content/schemas/manifest.ts"
  - "src/content/schemas/ship.ts"
  - "src/content/schemas/system.ts"
  - "src/content/systems.test.ts"
  - "src/content/systems.ts"
  - "src/content/types.ts"
  - "src/main.ts"
  - "src/vite-env.d.ts"
  - "tests/compliance-assets.test.ts"
  - "tests/contract/container-contract.test.ts"
  - "tests/e2e/models.spec.ts"
  - "tests/fixtures/dat/broken-truncated.dat"
  - "tests/fixtures/dat/face-underflow.dat"
  - "tests/fixtures/dat/oversize-nverts.dat"
  - "tests/fixtures/dat/quad-face-comma.dat"
  - "tests/fixtures/dat/quad-face.dat"
  - "tests/fixtures/plist/comment-only-array.plist"
  - "tests/fixtures/plist/duplicate-keys.plist"
  - "tests/fixtures/plist/empty-dict.plist"
  - "tests/fixtures/plist/malformed-missing-semicolon.plist"
  - "tests/fixtures/plist/malformed-unterminated.plist"
  - "tests/fixtures/plist/octal-escapes.plist"
  - "tests/fixtures/plist/quoted-key-with-space.plist"
  - "tests/fixtures/schemas/commodity-invalid.json"
  - "tests/fixtures/shipdata/cycle.plist"
  - "tests/fixtures/shipdata/dangling.plist"
  - "tests/fixtures/shipdata/overrides-adds-entry.plist"
  - "tests/fixtures/textures/asymmetric-8x8.png"
  - "tests/golden/content/commodities.json"
  - "tests/golden/content/equipment.json"
  - "tests/golden/content/lave.json"
  - "tests/golden/content/ship-bounds.json"
  - "tests/golden/content/ships.json"
  - "tests/guards/content-boundary.test.ts"
  - "tests/guards/sim-purity.test.ts"
  - "tests/guards/tools-determinism.test.ts"
  - "third_party/oolite/CHECKSUMS.sha256"
  - "third_party/oolite/Config/autoAImap.plist"
  - "third_party/oolite/Config/characters.plist"
  - "third_party/oolite/Config/crosshairs.plist"
  - "third_party/oolite/Config/customsounds.plist"
  - "third_party/oolite/Config/demoships.plist"
  - "third_party/oolite/Config/descriptions.plist"
  - "third_party/oolite/Config/equipment.plist"
  - "third_party/oolite/Config/explosions.plist"
  - "third_party/oolite/Config/global-settings.plist"
  - "third_party/oolite/Config/gpu-settings.plist"
  - "third_party/oolite/Config/gui-settings.plist"
  - "third_party/oolite/Config/hud-small.plist"
  - "third_party/oolite/Config/hud.plist"
  - "third_party/oolite/Config/javascript-errors.plist"
  - "third_party/oolite/Config/keyconfig.plist"
  - "third_party/oolite/Config/keyconfig2.plist"
  - "third_party/oolite/Config/keymappings_linux.plist"
  - "third_party/oolite/Config/keymappings_mac.plist"
  - "third_party/oolite/Config/keymappings_windows.plist"
  - "third_party/oolite/Config/logcontrol.plist"
  - "third_party/oolite/Config/material-defaults.plist"
  - "third_party/oolite/Config/missiontext.plist"
  - "third_party/oolite/Config/nebulatextures.plist"
  - "third_party/oolite/Config/oolite-font.plist"
  - "third_party/oolite/Config/pirate-victim-roles.plist"
  - "third_party/oolite/Config/planetinfo.plist"
  - "third_party/oolite/Config/role-categories.plist"
  - "third_party/oolite/Config/scenarios.plist"
  - "third_party/oolite/Config/screenbackgrounds.plist"
  - "third_party/oolite/Config/shader-uniform-bindings.plist"
  - "third_party/oolite/Config/shipdata-overrides.plist"
  - "third_party/oolite/Config/shipdata.plist"
  - "third_party/oolite/Config/shiplibrary.plist"
  - "third_party/oolite/Config/shipyard.plist"
  - "third_party/oolite/Config/speech_pronunciation_guide.plist"
  - "third_party/oolite/Config/startextures.plist"
  - "third_party/oolite/Config/trade-goods.plist"
  - "third_party/oolite/Config/verifyOXP.plist"
  - "third_party/oolite/Config/whitelist.plist"
  - "third_party/oolite/Config/world-scripts.plist"
  - "third_party/oolite/LICENSE-oolite.txt"
  - "third_party/oolite/Models/oolite_cobra3.dat"
  - "third_party/oolite/Models/oolite_coriolis.dat"
  - "third_party/oolite/Models/oolite_coriolis_dock.dat"
  - "third_party/oolite/Models/oolite_coriolis_faceplate.dat"
  - "third_party/oolite/Models/oolite_coriolis_tris.dat"
  - "third_party/oolite/SOURCE.md"
  - "third_party/oolite/Textures/oolite_cobra3_diffuse.png"
  - "third_party/oolite/Textures/oolite_cobra3_normal.png"
  - "third_party/oolite/Textures/oolite_cobra3_specular.png"
  - "third_party/oolite/Textures/oolite_cobra3_subents.png"
  - "third_party/oolite/Textures/oolite_cobra3_subents_normal.png"
  - "third_party/oolite/Textures/oolite_coriolis_diffuse.png"
  - "third_party/oolite/Textures/oolite_coriolis_dock_diffuse.png"
  - "third_party/oolite/Textures/oolite_coriolis_dock_normal.png"
  - "third_party/oolite/Textures/oolite_coriolis_faceplate_diffuse.png"
  - "third_party/oolite/Textures/oolite_coriolis_faceplate_normal.png"
  - "third_party/oolite/Textures/oolite_coriolis_faceplate_specular.png"
  - "third_party/oolite/Textures/oolite_coriolis_normal.png"
  - "third_party/oolite/Textures/oolite_coriolis_specular.png"
  - "third_party/oolite/Textures/oolite_coriolis_tris_diffuse.png"
  - "third_party/oolite/Textures/oolite_coriolis_tris_normal.png"
  - "third_party/oolite/Textures/oolite_coriolis_tris_specular.png"
  - "third_party/oolite/pin.json"
  - "tools/oolite-ingest/canonical/hash.ts"
  - "tools/oolite-ingest/canonical/json.ts"
  - "tools/oolite-ingest/cli.ts"
  - "tools/oolite-ingest/content-error.ts"
  - "tools/oolite-ingest/convert/commodities.test.ts"
  - "tools/oolite-ingest/convert/commodities.ts"
  - "tools/oolite-ingest/convert/dat.test.ts"
  - "tools/oolite-ingest/convert/dat.ts"
  - "tools/oolite-ingest/convert/equipment.test.ts"
  - "tools/oolite-ingest/convert/equipment.ts"
  - "tools/oolite-ingest/convert/glb.test.ts"
  - "tools/oolite-ingest/convert/glb.ts"
  - "tools/oolite-ingest/convert/labels.test.ts"
  - "tools/oolite-ingest/convert/labels.ts"
  - "tools/oolite-ingest/convert/ships.test.ts"
  - "tools/oolite-ingest/convert/ships.ts"
  - "tools/oolite-ingest/convert/systems.test.ts"
  - "tools/oolite-ingest/convert/systems.ts"
  - "tools/oolite-ingest/convert/textures.test.ts"
  - "tools/oolite-ingest/convert/textures.ts"
  - "tools/oolite-ingest/drift.test.ts"
  - "tools/oolite-ingest/failure-contract.test.ts"
  - "tools/oolite-ingest/generate.ts"
  - "tools/oolite-ingest/like-ship.test.ts"
  - "tools/oolite-ingest/like-ship.ts"
  - "tools/oolite-ingest/manifest.ts"
  - "tools/oolite-ingest/openstep/parser.test.ts"
  - "tools/oolite-ingest/openstep/parser.ts"
  - "tools/oolite-ingest/openstep/plist-value.ts"
  - "tools/oolite-ingest/openstep/tokenizer.ts"
  - "tsconfig.json"
  - "vitest.config.ts"
covered_digest: "v4:sha256:5963b8d50ad8c0432d6c5187c1ee7c159a8e59880ffd0901a60a3473095e9762"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "The Coriolis letterbox/dock opening reads correctly rather than mirrored, with the faceplate proud of the hull."
    test: "Open public/models/coriolis.glb in a glTF viewer (or the Phase 3 preview) and look through the dock opening; compare against the raw oolite_coriolis_diffuse.png / dock diffuse."
    expected: "The letterbox opening reads with the correct handedness (not mirrored), and the faceplate sits proud of the hull on the dock side."
    why_human: "Handedness as a viewer perceives it is a visual judgement. The automated tests pin the dock's 330/330 negative UV signed areas, the 14 mouth faces sharing that sign, the identity V orientation, and the faceplate z range outside the hull, but none of those assertions says what a human sees."
human_verification:
  - test: "Run `sh scripts/check-arch-determinism.sh` on an arm64-capable CI runner, or any host with QEMU binfmt arm64 registered."
    expected: "Exit 0 and the line `check-arch-determinism: arm64 and amd64 output are byte-identical (N files)`, with N recorded in the script's Result line."
    why_human: "This host cannot execute linux/arm64; the script exits 2 naming the missing capability. The cross-architecture half of DATA-08/D-06 is therefore unmeasured, not passed."
  - test: "Open public/models/coriolis.glb in a glTF viewer or the Phase 3 preview and look through the dock opening."
    expected: "The letterbox reads correctly rather than mirrored; the faceplate sits proud of the hull."
    why_human: "Visual appearance and handedness cannot be asserted by grep, GLB metadata, or signed-area tests."
---

# Phase 2: Data Pipeline & Content Compiler Verification Report

**Phase Goal:** Every system, commodity, ship, equipment item, and model the game uses is generated at build time from a pinned Oolite snapshot into typed content, and any unexplained drift fails the build.
**Verified:** 2026-11-03T13:16:17Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

The pipeline is real and reproducible: one command regenerated 36 emitted files from the pinned snapshot and left the working tree byte-identical, the drift gate reported `no differences` on the committed tree and named a mutated JSON byte and a mutated GLB byte as `CHANGED bytes`, and `docker compose run --rm verify` exited 0 twice (lint, typecheck, `assets:check`, 193 unit tests, production build, 3 Playwright tests). The content itself is correct at the values checked: 2,048 systems in eight 256-record chunks with unique `g{galaxy}-s{index}` IDs, 17 commodities with only `alien_items` untradeable, 41 equipment records, a 194-entry ship catalogue, and two valid GLBs with the Coriolis dock at `[0, 0, -500.2561]`.

The only unmet verification is visual: the Coriolis letterbox handedness is deferred to human UAT in `.planning/WINDOWS.md`. The arm64↔amd64 byte-identity claim is likewise unmeasured on this host (the script exits 2, never a pass). Two plan-level literal statements have documented substitutions (the independent GLB reader and the sim boundary denylist) and are reported as warnings, not as success-criterion failures.

### Observable Truths

| #   | Truth   | Status     | Evidence       |
| --- | ------- | ---------- | -------------- |
| 1   | **SC1:** One build command regenerates systems, commodities, equipment, ships, and models from the pinned snapshot with no hand-edited values, and the verify step fails when regenerated output differs. | ✓ VERIFIED | `docker compose run --rm assets` wrote 36 files and `git status --porcelain` stayed empty; `docker compose run --rm assets npm run assets:check` printed `assets:check: no differences` (exit 0); `compose.yaml` puts `assets:check` third in the fail-fast `verify` chain; `tools/oolite-ingest/drift.test.ts` (6/6) proves `CHANGED bytes` for a JSON byte and a GLB byte, plus `MISSING`, `EXTRA`, and `CHANGED hash`. |
| 2   | **SC2:** All 2,048 systems across the eight galaxies and all 17 commodities are available as typed content with stable IDs, correct units, and Alien Items present but never tradeable. | ✓ VERIFIED | Eight `src/content/generated/systems/g0..g7.json` files contain exactly 256 records each (2,048 total; 2,048 unique IDs); `commodities.json` contains 17 keys in `sortOrder` 100–1700, `gold`/`platinum` are `kg`, `gem_stones` is `g`, and `alien_items` is the sole `tradeable: false` record with zero quantities. Lave is `g0-s7` with the researched chart position `[20, 173]`. |
| 3   | **SC3a:** The Cobra Mk III and Coriolis are emitted as load-ready GLBs with correct orientation, winding, per-face/per-corner normals, and bounding boxes. | ✓ VERIFIED | Both GLBs have magic `0x46546C67`, version 2, a declared length equal to their byte length, `generator = wegolite-oolite-ingest/1`; the Coriolis has four nodes `hull/faceplate/tris/dock` with the dock at `[0, 0, -500.2561]`; `glb.test.ts` asserts every one of the 1,076 Cobra and 2,226 Coriolis triangles fronts Oolite's converted normal, pins the 12 near-perpendicular Cobra corner dots within `1e-4`, and checks converted bounds; `tests/e2e/models.spec.ts` fetches both GLBs and all 21 texture URIs over `vite preview` in Chromium. Actual `GLTFLoader` use is deliberately Phase 3 per `02-CONTEXT.md` ("Phase 2 only needs to produce and assert them"). |
| 4   | **SC3b:** The Coriolis letterbox reads correctly rather than mirrored. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The automated prerequisites are green: the dock has 330/330 negative signed UV areas, all 14 mouth faces share the sign, the asymmetric fixture confirms identity V orientation (`v = 0` is the top row, no flip), and the faceplate's converted z range `[-534.298, -492.929]` lies outside the hull's `[-495.918, 500]`. Whether the opening *looks* mirrored is a human visual judgement; `.planning/WINDOWS.md` records it as open `unrun-verify`. |
| 5   | **SC4:** A malformed plist, a cyclic `like_ship` chain, or a broken mesh fails with a message naming the file and construct instead of producing a silently wrong number. | ✓ VERIFIED | `failure-contract.test.ts` (5/5) asserts `PLIST_PARSE` with file, construct, 1-based line/column and a bounded excerpt; `like-ship.test.ts` (12/12) asserts `LIKE_SHIP_CYCLE` with the closed chain `a → b → c → a` and `LIKE_SHIP_DANGLING` with the chain to the missing key; `dat.test.ts` (21/21) asserts `DAT_MESH` naming the file and face/section for a 2-vertex face, a truncated `FACES`, an oversized `NVERTS`, and a non-finite coordinate, plus `MESH_BOUNDS` naming the file and axis. |

**Score:** 4/5 truths verified (0 failed; 1 present, behavior-unverified; 0 overrides)

SC3 is split into two independently verifiable halves because the model-conversion half is proven by geometry tests while the letterbox half is visual. Treating them as one truth would either overstate the visual check or discard the geometry evidence.

### Deferred to Later Phases (informational)

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Loading the emitted GLBs through Three.js `GLTFLoader` and rendering them | Phase 3 | `02-CONTEXT.md` line 145: "later phases load GLBs through `GLTFLoader`; Phase 2 only needs to produce and assert them." Phase 3's WORLD-01/FLGT requirements place the Cobra in Lave. |
| 2 | Applying commodity pod conversions and pricing the equipment catalogue | Phase 5 | `podConversion.kilogramsPerUnit` is carried metadata (D-13); `priceUnit: "decicredits"` is the content contract, and ECON-01..03 own the formula. |

### Required Artifacts

| Artifact | Expected    | Status | Details |
| -------- | ----------- | ------ | ------- |
| `third_party/oolite/pin.json`, `SOURCE.md` | Pinned release/commit/retrieved | ✓ VERIFIED | `1.93.1-241` / `7437f22` / `2026-11-03`, identical in `manifest.json`, README, and `SOURCE.md`. |
| `third_party/oolite/CHECKSUMS.sha256` | Hash of every vendored byte | ✓ VERIFIED | 64 rows (self excluded) for 65 files under `third_party/oolite`; `compliance-assets.test.ts` re-hashes all 65 and proves agreement with `ASSETS.md`. |
| `tools/oolite-ingest/openstep/{tokenizer,parser,plist-value}.ts` | OpenStep parser with located errors and null-prototype dictionaries | ✓ VERIFIED | Parses all 40 vendored Config plists (31 dict roots / 9 array roots); 17 parser tests + 5 failure-contract tests. |
| `tools/oolite-ingest/convert/systems.ts` | 2,048 systems, 8 chunks, stable IDs | ✓ VERIFIED | Enforces 256 per galaxy, rejects a third non-system key, sorts by numeric `systemIndex`, keeps raw values. |
| `tools/oolite-ingest/convert/commodities.ts` | 17 typed commodities, units, untradeable alien items | ✓ VERIFIED | Explicit `0=t / 1=kg / 2=g` table; integer `priceAverage`; authored-precision ratios; `tradeable = key !== "alien_items"`. |
| `tools/oolite-ingest/convert/equipment.ts` | 41 equipment records | ✓ VERIFIED | `tuple6` guard; integer decicredit prices; open conditions record. |
| `tools/oolite-ingest/convert/labels.ts` | Six label arrays + sysdata templates | ✓ VERIFIED | `economy` 8, `government` 8, `legalStatus` 3, `rating` 9, `inhabitants` 5, `systemDescription` 36, plus `formatTemplates`; no invented TL table. |
| `tools/oolite-ingest/like-ship.ts`, `convert/ships.ts` | Oolite-faithful inheritance + 194-entry catalogue | ✓ VERIFIED | Shallow merge, non-inheritable keys, five alias pairs, override-before-resolution, cycle/dangling detection, depth cap, order-independence; 194 entries / 81 templates / 102 usable / 7 usable `modelVendored`. |
| `tools/oolite-ingest/convert/dat.ts` | `.dat` parser, normals, winding repair, bounds | ✓ VERIFIED | Both separator dialects, exact counts for five meshes, normal-mode selection, winding repair, `MODEL_BOUNDS`. |
| `tools/oolite-ingest/convert/glb.ts` | Deterministic GLB writer + materials | ✓ VERIFIED | Own container, fixed generator, authored corner order, one Z negation, converted-normal front-face assertions, four-node Coriolis, `extras.oolite`. |
| `tools/oolite-ingest/convert/textures.ts` | Texture closure, verbatim copies, emissive bake | ✓ VERIFIED | 16-name two-way closure, hash-verified copies, header-first PNG decode, five byte-stable `_emissive.png` files. |
| `tools/oolite-ingest/generate.ts`, `cli.ts`, `manifest.ts` | One regeneration entry point + drift gate | ✓ VERIFIED | All emitters wired; manifest of 35 rows; `--check` regenerates into `mkdtemp`; no force/allowlist/override. |
| `src/content/schemas/*.ts`, `src/content/types.ts`, `src/content/index.ts` | Typed content surface and boot manifest assertion | ✓ VERIFIED | Strict schemas for our output, open records for raw Oolite dictionaries; `types.ts` is `export type` only; `assertContentManifest` throws a path-naming `ContentBoundaryError` before the renderer. |
| `src/content/generated/{commodities,equipment,labels,ships,manifest}.json`, `systems/g0..g7.json` | Compiled typed content | ✓ VERIFIED | 17 / 41 / labels / 194 / 35 manifest rows / 8×256 systems; byte-identical after a regeneration. |
| `public/models/cobra3.glb`, `coriolis.glb` | Load-ready models | ✓ VERIFIED | 119,816 B / 248,448 B; valid glTF 2.0; independent `@gltf-transform` read and Chromium delivery path. |
| `public/textures/*.png` | 16 copied + 5 baked textures | ✓ VERIFIED | 21 files; every GLB image URI resolves to an existing file with a PNG signature (e2e). |
| `tests/golden/content/{lave,commodities,equipment,ships,ship-bounds}.json` | Pinned fidelity goldens | ✓ VERIFIED | Lave field-by-field; commodity anchors and authored decimals; 41 equipment TL/price anchors; catalogue counts and Cobra/Coriolis anchors; float32-exact bounds and 12-face normal baseline. |
| `scripts/vendor-oolite.sh` | Single provenance authority | ✓ VERIFIED | Fetches the pinned ref, writes `CHECKSUMS.sha256`, `pin.json` and every `ASSETS.md` hash; second run changes no byte. |

### Key Link Verification

| From | To  | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| `compose.yaml` `verify` | `package.json` `assets:check` | fail-fast `&&` chain | ✓ WIRED | `assets:check` is the third stage; a diff exits 1 before tests/build. |
| `tools/oolite-ingest/generate.ts` | all converters | `generateContent()` | ✓ WIRED | Reads six Config plists, compiles ships once, emits JSON, GLBs, textures, and the manifest. |
| `src/content/generated/manifest.json` | `src/main.ts` | `assertContentManifest(manifest)` | ✓ WIRED | Runs before `buildRenderer`; a mismatch throws `ContentBoundaryError`. |
| `like-ship.ts` | `convert/ships.ts` → `convert/glb.ts` | resolved catalogue → `modelVendored` / materials / subentities | ✓ WIRED | Only the seven usable vendored entries produce geometry; the dock is selected by `subentity_key`. |
| `convert/glb.ts` `EMITTED_ENTRIES` | `convert/textures.ts` closure → `public/textures` | `resolveReferencedTextures` + `copyTextures` | ✓ WIRED | Set equality asserted in both directions; every emitted GLB image URI exists. |
| `public/models/*.glb` | `tests/e2e/models.spec.ts` | `fetch` over `vite preview` | ✓ WIRED | Chromium fetches both GLBs and every image URI; asserts the header, graph, dock translation, and PNG signatures. |
| `eslint.config.js` sim zone | `tests/guards/content-boundary.test.ts` | `no-restricted-imports` + typecheck probe | ✓ WIRED (denylist — W-3) | Denies `content/index*`, `content/schemas/**`, `content/generated/**`; `content/systems.ts` is not denied, so the literal "nothing else" is not fully enforced. |
| `scripts/check-arch-determinism.sh` | `docker buildx` arm64/amd64 | two platform builds + byte/hash/manifest compare | ✓ WIRED (unmeasured — W-4) | Script exits 2 here because linux/arm64 cannot execute; no evidence of a pass. |
| `scripts/vendor-oolite.sh` | `CHECKSUMS.sha256` / `ASSETS.md` | computed hashes | ✓ WIRED | `compliance-assets.test.ts` proves filesystem = `ASSETS.md` = checksums. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `commodities.json` | 17 records | `third_party/oolite/Config/trade-goods.plist` → `convert/commodities.ts` | Yes — exact authored prices, ratios, units | ✓ FLOWING |
| `systems/g0..g7.json` | 2,048 records | `planetinfo.plist` → `convert/systems.ts` | Yes — exact authored Lave/system fields | ✓ FLOWING |
| `equipment.json` | 41 records | `equipment.plist` → `convert/equipment.ts` | Yes — authored TL/price/conditions | ✓ FLOWING |
| `labels.json` | 6 arrays + templates | `descriptions.plist` → `convert/labels.ts` | Yes — exact authored arrays and templates | ✓ FLOWING |
| `ships.json` | 194 records | `shipdata.plist` + `shipdata-overrides.plist` → `like-ship.ts` → `convert/ships.ts` | Yes — resolved inheritance, 102 usable, 7 vendored models | ✓ FLOWING |
| `cobra3.glb`, `coriolis.glb` | mesh bytes | five `.dat` files + resolved shipdata → `dat.ts` → `glb.ts` | Yes — authored vertices/normals/UVs/materials | ✓ FLOWING |
| `public/textures/*.png` | images | vendored PNGs copied verbatim; alpha channel baked to greyscale | Yes — 21 files, hashes in manifest | ✓ FLOWING |
| `galaxy0()` → app probe | `homeSystems`, `codeSplitGalaxies` | eager g0 glob + seven lazy globs | Yes — 256 and 7 reported at boot | ✓ FLOWING |
| Emitted GLBs → Three.js renderer | scene graph | `GLTFLoader` | Not yet — Phase 3 | N/A (deferred by `02-CONTEXT.md`; e2e proves delivery, not rendering) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full regeneration from the pinned snapshot | `docker compose run --rm assets` | `assets:build: wrote 36 files`; `git status --porcelain` empty afterwards | ✓ PASS |
| Drift gate on the committed tree | `docker compose run --rm assets npm run assets:check` | `assets:check: no differences`, exit 0 | ✓ PASS |
| Drift gate catches a mutated JSON byte and a mutated GLB byte | `docker compose run --rm test npx vitest run tools/oolite-ingest/drift.test.ts` | 6/6 tests; `CHANGED bytes` named for `commodities.json` and `cobra3.glb` | ✓ PASS |
| Failure contract (malformed plist, cycle, broken mesh) | `docker compose run --rm test npx vitest run tools/oolite-ingest/drift.test.ts tools/oolite-ingest/failure-contract.test.ts tools/oolite-ingest/like-ship.test.ts tools/oolite-ingest/convert/dat.test.ts` | 44/44 tests passed | ✓ PASS |
| Definition of done | `docker compose run --rm verify` | Exit 0 twice: 23 test files / 193 unit tests, production build, 3 Playwright tests | ✓ PASS |
| Quick unit-test service | `docker compose run --rm test` | 2 failures / 2 passes in 4 full runs; failures are the guard-test race described in W-1; both targeted runs and both `verify` runs passed | ⚠️ WARN (intermittent) |
| Cross-architecture byte identity | `sh scripts/check-arch-determinism.sh` | Exit 2: `linux/arm64 execution is unavailable, no QEMU binfmt` | ? SKIP (manual) |
| System and commodity counts | `python3` over the committed JSON | 2,048 systems, 8 chunks × 256, 2,048 unique IDs; 17 commodities; `alien_items` the only untradeable | ✓ PASS |
| GLB header and Coriolis graph | `python3` GLB chunk parse | Magic `0x46546c67`, version 2, declared length equals file length; four nodes; dock translation `[0, 0, -500.2561]` | ✓ PASS |
| No hand-edited generated values | `git status --porcelain` after regeneration | Empty | ✓ PASS |

### Probe Execution

N/A — no probe scripts are declared. `find scripts -path '*/tests/probe-*.sh'` returned nothing, and no plan or summary names a probe file. The only separately executed script is `scripts/check-arch-determinism.sh`, reported under Behavioral Spot-Checks and Human Verification (it is not part of `verify`).

### Test Quality Audit

| Test File | Linked Req | Active | Skipped | Circular | Assertion Level | Verdict |
|-----------|-----------|--------|---------|----------|-----------------|---------|
| `openstep/parser.test.ts`, `failure-contract.test.ts` | DATA-01 | 22 | 0 | No | Value (codes, file, line/column, excerpts) | OK |
| `like-ship.test.ts` | DATA-02 | 12 | 0 | No | Behavioral (cycles, chains, shuffle invariance) | OK |
| `convert/dat.test.ts` | DATA-03, DATA-04 | 21 | 0 | No | Value (counts, normals, bounds) | OK |
| `convert/glb.test.ts` | DATA-04, DATA-07 | 12 | 0 | No | Value + behavioral (front faces, bounds, materials, reader round-trip) | OK |
| `convert/textures.test.ts` | DATA-04, DATA-07 | 17 | 0 | No | Value (closure, decode caps, bake bytes, V orientation) | OK |
| `convert/systems.test.ts`, `src/content/systems.test.ts` | DATA-05 | 12 | 0 | No | Value (2,048, IDs, Lave, splits) | OK |
| `convert/commodities.test.ts` | DATA-06 | 7 | 0 | Partial — golden captured from the converter, but five anchors and authored decimals are independently pinned | Value | OK with provenance note |
| `convert/equipment.test.ts`, `convert/ships.test.ts` | DATA-07 | 19 | 0 | No | Value (41 anchors, 194/81/102, tri-state, dock) | OK |
| `drift.test.ts`, `tests/guards/tools-determinism.test.ts` | DATA-08 | 11 | 0 | No | Behavioral (each failure class; each banned API) | OK |
| `tests/compliance-assets.test.ts` + `tests/compliance.test.ts` | DATA-09 | 22 | 0 | No | Value (per-file hashes, vacuity guard, malformed rows fail closed) | OK |

**Disabled tests on requirements:** 0.
**Circular patterns detected:** 0 at test time. The commodity/system/equipment/ship goldens are converter-produced baselines (the commodity header says so explicitly), so they prove consistency as well as the independently pinned anchors do; each suite separately asserts researched values (Lave field-by-field, five commodity anchors, 41 equipment anchors, Cobra/Coriolis anchors). Treated as PARTIAL provenance, not a blocker.
**Insufficient assertions:** 0.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DATA-01 | 02-01, 02-02 | OpenStep ASCII plist parser: comments, unquoted keys, nested dict/arrays, actionable parse errors | ✓ SATISFIED | 40/40 vendored Config plists parse (31 dict / 9 array roots); `PLIST_PARSE` carries code/file/construct/line/column; fast-check total-function property. |
| DATA-02 | 02-05 | `like_ship`/template inheritance with cycle detection and per-key overrides | ✓ SATISFIED | Shallow merge, non-inheritable keys, alias pairs, override-before-resolution, `LIKE_SHIP_CYCLE` closed chain, `LIKE_SHIP_DANGLING`, depth cap; 194-entry catalogue. |
| DATA-03 | 02-04 | `.dat` parser: NVERTS/NFACES/VERTEX/FACES/TEXTURES/END, >3-vertex truncation, per-face normals | ✓ SATISFIED | Exact counts on five meshes; comma dialect; truncation warning; explicit/smooth/per-face modes; 595 distinct Cobra normals. |
| DATA-04 | 02-01, 02-04, 02-06, 02-07 | GLB + manifest; Oolite +Z-forward → Three −Z-forward conversion and winding verified by fixture | ✓ SATISFIED | Valid glTF 2.0 with one Z negation and authored corner order; 1,076 + 2,226 front-face assertions; V-orientation fixture; manifest has 35 rows including both GLBs and 21 textures. |
| DATA-05 | 02-03 | All 2,048 systems across eight galaxies with stable IDs, names, positions | ✓ SATISFIED | 8 × 256 records; 2,048 unique `g{galaxy}-s{index}` IDs; Lave `g0-s7` at chart `[20, 173]`; raw radius/TL; absent-vs-present `percent_cloud`. |
| DATA-06 | 02-01 | All 17 commodities, correct units (decicredits/kg/g), Alien Items present but untradeable | ✓ SATISFIED | 17 records; integer `priceAverage`; `gold`/`platinum` kg, `gem_stones` g; `alien_items` zero quantities and `tradeable: false`, exactly one untradeable. |
| DATA-07 | 02-03, 02-05, 02-06, 02-07, 02-09 | Cobra Mk III, Coriolis, equipment catalogue, Lave as typed compiled content | ✓ SATISFIED | 194-entry catalogue with 102 usable; 41 equipment records; Lave in `g0.json`; both GLBs with four-node Coriolis composite; typed schemas and `types.ts`. |
| DATA-08 | 02-01, 02-03, 02-05, 02-06, 02-07, 02-08, 02-09 | Golden fidelity tests against the pinned snapshot; build fails on unexplained drift | ✓ SATISFIED (same-host); cross-arch unmeasured | Drift gate + 6 negative drift cases; goldens; determinism lint zone; `assets:check` third in `verify`. Arm64↔amd64 byte identity is a manual-only item (W-4). |
| DATA-09 | 02-01, 02-02, 02-04, 02-07, 02-09 | Snapshot pinned to release/commit and recorded | ✓ SATISFIED | `pin.json` / `SOURCE.md` record `1.93.1-241` / `7437f22` / `2026-11-03`; 65 vendored files, 64 checksum rows, 23 public provenance rows; compliance walk proves three sources agree. |

**Orphaned requirements:** none. All nine DATA requirements are declared by at least one plan and all are mapped to Phase 2 in `REQUIREMENTS.md`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `tools/oolite-ingest/convert/dat.ts` | 35, 584 | `FIXME` | ℹ️ Info | Both occurrences describe Oolite's own source comment about its per-component sign test, not unreferenced debt in this code. Not a debt-marker blocker. |
| `tests/guards/content-boundary.test.ts`, `tests/guards/sim-purity.test.ts` | — | Parallel probe race | ⚠️ Warning | `sim-purity` writes `src/sim/__purity_dom_probe.ts` while `content-boundary` runs `tsc -p tsconfig.sim.json` over the whole project; 2 of 4 full `docker compose run --rm test` runs failed and 2 passed, both files pass in isolation, and `verify` passed 2/2. See W-1. |
| `eslint.config.js` | 82–95 | Denylist, not allowlist | ⚠️ Warning | `src/content/systems.ts` is a runtime module not denied by the sim zone (review WR-02). No `src/sim` module imports it today; `tsconfig.sim.json` also rejects its Vite glob. See W-3. |
| `eslint.config.js` | 141–218 | Incomplete Math ban | ⚠️ Warning | `Math.atan2`, `hypot`, `cbrt`, `log2`, `toExponential`, etc. remain allowed in the generator zone (review WR-03). No current generator call uses them. See W-5. |
| `tools/oolite-ingest/generate.ts` | 133–157 | Writes before texture closure | ⚠️ Warning | A failed `assets:build` can leave a partially written tree; `assets:check` reports the drift on the next run (review WR-08). See W-6. |
| `tools/oolite-ingest/cli.ts` | 279–285 | Entry guard fails open | ⚠️ Warning | A symlinked/wrapper invocation can skip `run()` and exit 0 without comparing (review WR-05). The container invokes the CLI by direct path. See W-7. |
| `tools/oolite-ingest/convert/glb.ts` | 719–727 | String-form `emission_map` dropped | ⚠️ Warning | A bare filename emission map would produce no emissive texture; no current `EMITTED_ENTRIES` entry uses that form (review WR-04). See W-8. |

No `TBD`, `TODO`, `HACK`, `PLACEHOLDER`, or "not yet implemented" markers were found in phase-modified implementation files. No stub renderers, empty API handlers, or hardcoded-empty UI props exist in this phase.

### Warnings and Known Follow-Ups (non-blocking)

- **W-1 — Guard-test isolation race.** `docker compose run --rm test` failed 2 of 4 full runs: `tests/guards/content-boundary.test.ts` runs `tsc -p tsconfig.sim.json` over the whole project while `tests/guards/sim-purity.test.ts` has its DOM probe in `src/sim/`, producing `TS2584 Cannot find name 'document'`. Both files pass in isolation; `verify` passed twice. Fix by serializing the guard files, scoping the typecheck probe, or excluding `__purity_*` probes from the project. This is a test-harness defect, not a content-pipeline defect.
- **W-2 — Plan 06's literal `NodeIO.readBinary` truth is replaced by `readJSON`.** `readBinary` refuses any GLB with external image URIs by design, and D-20 requires external textures. The test feeds the file's own JSON and BIN to `readJSON` and *asserts* the `readBinary` refusal, so external textures cannot silently become embedded. The intent (independent validation) is met; if the literal must-have is enforced, it needs an accepted override.
- **W-3 — Plan 09's "content/types and nothing else" is a denylist.** Review WR-02: `content/systems.ts` is not denied. Mitigation: no sim module imports it, and `tsconfig.sim.json` (types `[]`) rejects its Vite glob. Deferred follow-up; re-check when a runtime content module is added.
- **W-4 — arm64↔amd64 byte identity is unmeasured.** `scripts/check-arch-determinism.sh` exits 2 (`no QEMU binfmt`), never a pass; `Result:` records the outstanding CI run. Human verification item 1.
- **W-5 — Determinism lint zone is incomplete.** Review WR-03: several implementation-approximated `Math` members and `toExponential`/`toLocaleString` are allowed. The current generator uses only `+ - * /`, integers, `Math.sqrt` and `Math.fround`, so no committed byte is affected.
- **W-6 — `assets:build` writes before the texture closure asserts.** Review WR-08. `assets:check` catches the half-written tree on the next run; not a correctness issue for the committed tree.
- **W-7 — CLI entry guard fails open under a symlink/wrapper.** Review WR-05. Direct container invocation works; hardening is a follow-up.
- **W-8 — String-form `emission_map` is dropped.** Review WR-04. No current `EMITTED_ENTRIES` entry uses the string form; the five emitted emissive maps are correct.
- **W-9 — Cross-arch cleanup trap can turn a pass into exit 1.** Review WR-06: root-owned container output can make `rm -rf` fail under `set -eu`. Never triggered locally (no arm64 run); fix with the CI job.
- **W-10 — README/provenance prose is a review judgement.** Plan 07/09 marked the row wording and README completeness as human-judgement coverage. The CR-01/WR-01 fix in `4583156` was re-read and the `ASSETS.md` rows now carry Kind, Origin, Source URL, Author, Licence, Modifications and SHA-256 for all 23 `public/` assets; the README anchors (`Content pipeline`, `assets:check`, `7437f22`, `check-arch-determinism`) are present.

### Decision Coverage

All trackable `02-CONTEXT.md` decisions are honored by shipped artifacts.

- Total: 25
- Honored: 25
- Not honored: 0

### Human Verification Required

#### 1. Coriolis letterbox / dock-opening handedness

**Test:** Open `public/models/coriolis.glb` in a glTF viewer, or the Phase 3 preview once it loads the model. Look through the dock opening and compare the opening/faceplate against the raw `oolite_coriolis_diffuse.png` and `oolite_coriolis_dock_diffuse.png`.
**Expected:** The letterbox reads correctly rather than mirrored; the faceplate sits proud of the hull; the dock opening matches the visible geometry.
**Why human:** Handedness as perceived by a viewer is a visual judgement. The automated tests pin the dock's 330/330 negative UV areas, the 14 mouth faces' shared sign, the identity V orientation, and the faceplate's z extent outside the hull, but none of them can say what a human sees. `.planning/WINDOWS.md` records this as open `unrun-verify`.

#### 2. arm64 ↔ amd64 byte-identical generated output

**Test:** Run `sh scripts/check-arch-determinism.sh` on an arm64-capable CI runner, or any host with QEMU binfmt arm64 registered.
**Expected:** Exit 0 and the line `check-arch-determinism: arm64 and amd64 output are byte-identical (N files)`, with N written into the script's `Result:` line.
**Why human:** This host has no linux/arm64 execution; the script exits 2 with `linux/arm64 execution is unavailable, no QEMU binfmt`. The cross-architecture half of DATA-08/D-06 is therefore unmeasured, not passed.

### Gaps Summary

No success criterion is failed. The build-time pipeline is present, wired, deterministic on this host, and proven against the pinned snapshot: 2,048 systems, 17 commodities, 41 equipment records, a 194-entry ship catalogue, two valid GLBs, 21 textures, a 35-row manifest, and a drift gate that names a mutated JSON byte and a mutated GLB byte. The malformed-plist, cyclic-`like_ship`, and broken-mesh paths each fail with a located, file-naming error.

The phase is `human_needed`, not `passed`, because two acceptance properties cannot be settled by an executor in this container: the Coriolis letterbox is a visual check, and arm64↔amd64 byte identity requires an arm64-capable runner. The findings recorded above are warnings, not failed must-haves: the guard-test race (W-1), the two documented plan-level substitutions (W-2, W-3), and the review-disposition follow-ups (W-5..W-9). None of them changes a generated value or falsifies the phase goal. Recommended before `/gsd-ship`: fix W-1 (serialize or scope the guard probes), then run the two human checks.

---

_Verified: 2026-11-03T13:16:17Z_
_Verifier: the agent (gsd-verifier)_
