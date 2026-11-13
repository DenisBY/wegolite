# Phase 2: Data Pipeline & Content Compiler - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-11-03
**Phase:** 2-Data Pipeline & Content Compiler
**Areas discussed:** Snapshot pinning, Drift gate policy, Model fidelity depth, Catalogue scope & IDs, Content delivery shape, Failure contract, Texture pipeline, Lave & economy metadata

---

## Snapshot pinning

### How should the pinned Oolite source enter the repository and the Docker build?

| Option | Description | Selected |
|--------|-------------|----------|
| Vendored subset | Commit only the files Phase 2 needs under third_party/oolite | yes |
| Git submodule | Reference the Oolite repository as a submodule |  |
| Pinned tarball at image build | Download and extract a pinned archive during the image build |  |

**User's choice:** Vendored subset committed under third_party/oolite, recorded per-file in ASSETS.md
**Notes:** Selected the recommended option; no additional constraints.

### How wide should the vendored subset be?

| Option | Description | Selected |
|--------|-------------|----------|
| All Config + two ships | All Resources/Config plists plus the Cobra and Coriolis .dat files and textures | yes |
| Phase-2-minimal | Only the files each converter reads right now |  |
| Full Resources tree | Vendor the entire Oolite Resources directory |  |

**User's choice:** All Resources/Config/*.plist plus only the Cobra and Coriolis composite .dat files and textures Phase 2 compiles
**Notes:** Selected the recommended option; no additional constraints.

### Which Oolite revision should the pin target?

| Option | Description | Selected |
|--------|-------------|----------|
| Research snapshot | Oolite 1.93.1-241 at commit 7437f22, already audited | yes |
| Latest stable release | The newest tagged Oolite release |  |
| Latest master | Track the development branch |  |

**User's choice:** Research snapshot 1.93.1-241 at commit 7437f22
**Notes:** Selected the recommended option; no additional constraints.

### How should the vendored snapshot be refreshed when a newer Oolite is adopted?

| Option | Description | Selected |
|--------|-------------|----------|
| Bump script + review | Re-extract, rewrite hashes and manifest, regenerate, require reviewed diffs | yes |
| Manual copy with docs | Hand-copy files and update documentation |  |
| Automated updater | A background job that opens update PRs |  |

**User's choice:** Explicit bump script that re-extracts at a new ref, rewrites ASSETS.md hashes and manifest, regenerates content, and requires reviewed diffs
**Notes:** Selected the recommended option; no additional constraints.

---

## Drift gate policy

### Which generated artifacts should be committed to the repository?

| Option | Description | Selected |
|--------|-------------|----------|
| All generated output | Typed JSON, GLBs, copied textures, and the manifest | yes |
| JSON + manifest only | Rebuild textures and GLBs but do not commit them |  |
| Nothing generated | Build everything in CI with no committed artifacts |  |

**User's choice:** All generated output: typed JSON, GLBs, copied textures, and manifest, diffed by verify
**Notes:** Selected the recommended option; no additional constraints.

### How should the drift check compare generated output?

| Option | Description | Selected |
|--------|-------------|----------|
| Canonical bytes + SHA-256 | Stable serialization plus per-file hashes, proven cross-architecture | yes |
| Raw byte diff | Direct byte comparison of whatever the writer emits |  |
| Semantic deep-equal | Parse and compare structures, ignoring formatting |  |

**User's choice:** Canonical bytes plus per-file SHA-256, proven identical on arm64 Docker and amd64 CI; exclude genuinely arch-dependent fields with documentation
**Notes:** Selected the recommended option; no additional constraints.

### Where should the drift check run in the container workflow?

| Option | Description | Selected |
|--------|-------------|----------|
| Inside verify, before build | lint, typecheck, assets:check, test, build, e2e | yes |
| Separate assets service | Its own Compose service, outside verify |  |
| CI-only check | Run only in the remote pipeline |  |

**User's choice:** Inside verify, before build: lint -> typecheck -> assets:check -> test -> build -> e2e
**Notes:** Selected the recommended option; no additional constraints.

### What should happen when regenerated output differs from committed output?

| Option | Description | Selected |
|--------|-------------|----------|
| No override | Any diff fails; regenerate, review, and commit | yes |
| Allowlist with justification | Permit documented exceptions |  |
| Warn-only for non-numeric changes | Block numeric drift but warn on the rest |  |

**User's choice:** No override; rerun assets:build, review, and commit, or fix the writer/hash exclusion
**Notes:** Selected the recommended option; no additional constraints.

---

## Model fidelity depth

### How much of the Coriolis should the compiler produce in Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Full composite | Hull, faceplate, tris, and dock as separate nodes | yes |
| Hull + dock only | Drop faceplate and tris detail |  |
| Hull only | A single mesh with no subentities |  |

**User's choice:** Full composite: hull, faceplate, tris, and dock as separate nodes with local transforms; dock at z=500.2561
**Notes:** Selected the recommended option; no additional constraints.

### How faithful should Oolite's materials be in the generated GLBs?

| Option | Description | Selected |
|--------|-------------|----------|
| Approximate PBR + extras | Metalness 0, roughness from gloss, raw values in extras.oolite | yes |
| Custom Oolite Phong material now | Reproduce Oolite's shading model exactly |  |
| Diffuse only | Ignore specular and emissive |  |

**User's choice:** Approximate metallic-roughness PBR with original Oolite values preserved in extras.oolite
**Notes:** Selected the recommended option; no additional constraints.

### How should the Coriolis emission map (alpha-channel extract) be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Bake emissive PNG | Extract the alpha channel to greyscale at build time | yes |
| Omit emission in v1 | No emissive map |  |
| Defer to a later material | Revisit when the renderer grows |  |

**User's choice:** Bake a separate greyscale emissive PNG at build time
**Notes:** Selected the recommended option; no additional constraints.

### How strict should the geometry conversion contract be?

| Option | Description | Selected |
|--------|-------------|----------|
| Full source semantics | Per-face normals, smooth groups, UV divide, V-flip fixture, winding, bbox | yes |
| Flat-only simplification | Always flat normals, ignore smooth groups |  |
| Runtime repair | Fix geometry at load time |  |

**User's choice:** Full source semantics: per-face normals, smoothGroup averaging only when smooth=yes, UV divide by declared size, asymmetric V-flip fixture, +Z to -Z winding reversal, bbox assertions
**Notes:** Selected the recommended option; no additional constraints.

---

## Catalogue scope & IDs

### How much of the equipment catalogue should the compiler ingest?

| Option | Description | Selected |
|--------|-------------|----------|
| All entries + metadata | Conditions, requires_* flags, tech level, and price preserved | yes |
| Only v1-functional items | Filter to what v1 can use now |  |
| All entries + evaluate scripts | Implement Oolite condition evaluation |  |

**User's choice:** All equipment entries plus metadata (conditions, requires_* flags, tech level, price); no script evaluation; Phase 5 filters
**Notes:** Selected the recommended option; no additional constraints.

### How much of shipdata should the compiler ingest?

| Option | Description | Selected |
|--------|-------------|----------|
| Full shipdata, two GLBs | Typed catalogue plus only the Cobra and Coriolis models | yes |
| Only the two ships end-to-end | Ignore other shipdata entries |  |
| All ships and all models | Convert every ship |  |

**User's choice:** Full shipdata typed catalogue with like_ship resolution; GLBs only for Cobra Mk III and the Coriolis composite
**Notes:** Selected the recommended option; no additional constraints.

### What should a star system's stable ID look like?

| Option | Description | Selected |
|--------|-------------|----------|
| g0-s7 string + numeric fields | Composite ID plus numeric galaxy and systemIndex | yes |
| Numeric {galaxy,index} only | No string identifier |  |
| Name slug | Derive the ID from the system name |  |

**User's choice:** Composite string g{galaxy}-s{index} (e.g. g0-s7 for Lave) alongside numeric galaxy and systemIndex fields
**Notes:** Selected the recommended option; no additional constraints.

### How should commodity money and units be represented in typed content?

| Option | Description | Selected |
|--------|-------------|----------|
| Integer decicredits + unit tags | Integer money, explicit t/kg/g, pod metadata | yes |
| Decimal credits | Floating-point credits |  |
| Raw plist values only | No unit normalisation |  |

**User's choice:** Integer decicredits plus explicit unit tags (t/kg/g) and pod-conversion metadata; Alien Items present with tradeable=false
**Notes:** Selected the recommended option; no additional constraints.

---

## Content delivery shape

### How should the generated content be packaged for the app?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-galaxy chunks | g0 eager; g1-g7 dynamically imported and code-split | yes |
| One bundled module | All eight galaxies in one chunk |  |
| Generated TS constants | Emit TypeScript instead of JSON |  |

**User's choice:** Per-galaxy JSON chunks (g0..g7); galaxy 0 eager, others dynamically imported/code-split by Vite
**Notes:** Selected the recommended option; no additional constraints.

### When should generated content be schema-validated?

| Option | Description | Selected |
|--------|-------------|----------|
| Build-time + manifest check | Zod all records at build; validate the manifest at boot | yes |
| Build-time only | No runtime validation |  |
| Build-time + full runtime validation | Re-validate all content on boot |  |

**User's choice:** Build-time zod validation for every parsed/emitted record; runtime validates only the manifest at startup
**Notes:** Selected the recommended option; no additional constraints.

### Where should generated content live, and how are its types owned?

| Option | Description | Selected |
|--------|-------------|----------|
| src/content/ + schema-derived types | Zod schema owns types via z.infer; sim imports type-only | yes |
| Top-level content/ + alias | A separate directory behind a tsconfig/Vite alias |  |
| public/ fetched at runtime | JSON fetched at runtime, outside the TypeScript program |  |

**User's choice:** src/content/ JSON modules with zod schema as the single source of truth and z.infer types; sim imports type-only and receives data through the app boundary
**Notes:** Selected the recommended option; no additional constraints.

---

## Failure contract

### What should a malformed-input error contain?

| Option | Description | Selected |
|--------|-------------|----------|
| Structured ContentError | Code, file, construct, line/column, and an excerpt | yes |
| File + construct only | The minimal criterion-4 message |  |
| Free-form thrown strings | Plain Error messages |  |

**User's choice:** One structured ContentError type with code (PLIST_PARSE, LIKE_SHIP_CYCLE, DAT_MESH, SCHEMA), repo-relative file, construct (key/template/mesh block), line/column where available, and a short offending excerpt; CLI prints it and exits non-zero; tests assert code+file+construct
**Notes:** Selected the recommended option; no additional constraints.

### Should the compiler stop at the first error or report more than one?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail-fast per run | Stop at the first structural error | yes |
| Aggregate per file | Collect every error in the current file |  |
| Aggregate across all files | Run everything and report all failures |  |

**User's choice:** Fail-fast per run at the first structural error with a precise location; cross-file failures such as a like_ship cycle still print the whole chain
**Notes:** Selected the recommended option; no additional constraints.

### How should the failure contract be kept from regressing?

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture per failure class | Malformed plist, cycle, broken .dat, and schema fixtures | yes |
| One representative test | Malformed plist only |  |
| Manual verification only | No automated assertion |  |

**User's choice:** Checked-in fixture per failure class (malformed plist, cyclic like_ship chain, broken .dat, schema-invalid record); tests assert error code, file, construct, and line/column
**Notes:** Selected the recommended option; no additional constraints.

---

## Texture pipeline

### How should ship textures be handled in Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Copy original PNGs | Verbatim diffuse and emission PNGs plus the baked emissive | yes |
| Compress to KTX2/Basis | GPU-compressed textures |  |
| Defer textures to Phase 3 | Geometry and material references only |  |

**User's choice:** Vendor and copy the original PNGs verbatim for the Cobra and Coriolis materials, plus the baked greyscale emissive PNG; no KTX2/Basis compression in Phase 2
**Notes:** Selected the recommended option; no additional constraints.

### Which texture files should be vendored?

| Option | Description | Selected |
|--------|-------------|----------|
| Referenced-only | Exactly the PNGs the two ships use | yes |
| All Cobra/Coriolis variants | Include pirate, trader, and redux textures |  |
| All vendored config textures | Every texture in the snapshot |  |

**User's choice:** Referenced-only: resolve the material list from the Cobra Mk III and Coriolis composite shipdata entries and vendor exactly those PNGs plus the alpha-derived emissive
**Notes:** Selected the recommended option; no additional constraints.

### What should happen when a referenced texture is missing or unreadable?

| Option | Description | Selected |
|--------|-------------|----------|
| Fail the build | ContentError naming the file, material, and expected path | yes |
| Warn and substitute placeholder | Keep building with a placeholder texture |  |
| Skip the material | Render the ship untextured |  |

**User's choice:** Fail the build with a ContentError naming the file, the referencing ship/material, and the expected snapshot path; no placeholders
**Notes:** Selected the recommended option; no additional constraints.

---

## Lave & economy metadata

### How much of planetinfo.plist should be compiled per system?

| Option | Description | Selected |
|--------|-------------|----------|
| All fields, typed | Every planetinfo field for all 2,048 systems | yes |
| Only near-term fields | Just what Phases 3 and 5 need |  |
| Only Lave now | The starting system only |  |

**User's choice:** Every field for all 2,048 systems exactly as authored, typed, preserving absent vs present; no second ingest later
**Notes:** Selected the recommended option; no additional constraints.

### How should Oolite's display strings be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Compile descriptions.plist now | Economy, government, and tech labels plus description templates | yes |
| Defer labels to Phase 5 | Numeric enums only |  |
| Hard-code labels in the UI | Strings written in components |  |

**User's choice:** Compile descriptions.plist economy/government/tech-level labels and system description templates into typed content now; no UI decisions
**Notes:** Selected the recommended option; no additional constraints.

### How should per-system market_definition be represented now?

| Option | Description | Selected |
|--------|-------------|----------|
| Tri-state metadata | Absent, empty, or explicit, with no computation | yes |
| Normalize to empty | Collapse absent and empty into one state |  |
| Generate markets at build time | Run the economy formula now |  |

**User's choice:** Tri-state metadata (absent / empty array / explicit definitions) preserving Oolite semantics; no price or stock computation, Phase 5 owns the economy
**Notes:** Selected the recommended option; no additional constraints.

### Should compiled system values be raw Oolite values or display-adjusted?

| Option | Description | Selected |
|--------|-------------|----------|
| Raw values, adjust at display | Store Oolite values; the UI applies +1 | yes |
| Pre-adjust for display | Store techlevel already incremented |  |
| Store both raw and display | Carry both values |  |

**User's choice:** Raw values exactly as authored; UI applies the +1 tech-level adjustment and other presentation tweaks at render time
**Notes:** Selected the recommended option; no additional constraints.

---

## the agent's Discretion

- Exact module and file names under `tools/oolite-ingest/` and `src/content/`.
- Zod schema organisation and whether schemas live beside converters or in a shared package.
- GLB `extras.oolite` field layout beyond preserving the original material values.
- CLI flag names, help text, and progress output.
- Fixture file names and directory layout.
- Exact `ContentError` code strings beyond the four required classes.
- Manifest field ordering and whether per-file hashes live in `manifest.json` or a sibling file.
- Whether the GLB writer uses `@gltf-transform/core` directly or a small in-repo writer.

## Deferred Ideas

- Economy price/stock formula, per-system market generation, and the 127-unit stock cap - Phase 5 / ECON-01.
- Oolite condition-script evaluation - out of scope; Phase 5 filters using preserved metadata.
- KTX2/Basis texture compression - Phase 7 if size or GPU memory demands it.
- GLBs for ships beyond the Cobra Mk III and Coriolis composite - later phases.
- Binary or XML plist support - not needed for the pinned snapshot.
- OXP support - permanently out of scope for v1.
