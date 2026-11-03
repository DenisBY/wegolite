# Phase 2: Data Pipeline & Content Compiler - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 2 delivers a deterministic, build-time content compiler that turns a pinned Oolite source snapshot into typed, read-only game content. It covers:

- An in-repo OpenStep ASCII plist parser with actionable errors.
- `like_ship` / template inheritance resolution with cycle detection and per-key overrides.
- A `.dat` mesh parser and deterministic GLB converter for the Cobra Mk III and the Coriolis composite.
- Typed content for all 2,048 systems across eight galaxies, all 17 commodities, the full equipment catalogue, the full shipdata catalogue, and Lave starting-system data.
- A content manifest and a drift gate that fails `verify` when regenerated output differs from committed output.

It does **not** cover runtime parsing, the economy price/stock formula, market generation, Oolite condition-script evaluation, UI presentation, flight physics, docking, or any ship other than the Cobra Mk III and Coriolis composite.

</domain>

<decisions>
## Implementation Decisions

### Snapshot & Provenance

- **D-01:** Vendor a committed subset of Oolite under `third_party/oolite/`, with every vendored file recorded per-file in `ASSETS.md`. Vendor all `Resources/Config/*.plist` plus only the Cobra Mk III and Coriolis composite `.dat` files and textures that Phase 2 compiles. — **Reversibility:** costly — changing the snapshot layout invalidates generator input paths, manifest entries, `ASSETS.md` hashes, and the reviewed drift baseline.
- **D-02:** Pin Oolite `1.93.1-241` at commit `7437f22` (the audited research snapshot). Later releases enter only through a deliberate bump. The bump script re-extracts at the new ref, rewrites `ASSETS.md` hashes and the manifest, regenerates content, and leaves `verify` failing until every diff is reviewed and committed. — **Reversibility:** costly — the pin underpins golden fixtures and any later save/content compatibility expectations.
- **D-03:** Keep raw `.dat`, `.plist`, and PNG sources in the repo as the preferred form. Generated GLBs are derivative CC BY-NC-SA works: ship `LICENSE-oolite.txt` and attribution, never relicense them as GPL/MIT. — **Reversibility:** one-way — licensing and provenance obligations attach to every distributed copy and cannot be undone after publication.

### Build & Drift Gate

- **D-04:** `assets:build` writes generated output; `assets:check` regenerates into a temporary directory and diffs. `verify` runs `lint → typecheck → assets:check → test → build → e2e`, fail-fast, with `assets:check` before `build`. — **Reversibility:** costly — the gate position and output contract are wired into Compose, CI, and every later content change.
- **D-05:** Commit all generated output (typed JSON, GLBs, copied textures, manifest). Compare canonical bytes plus per-file SHA-256. Canonical JSON uses sorted keys, fixed number formatting, LF, and no timestamps; deterministic GLB uses fixed buffer ordering and no generator/time metadata. — **Reversibility:** costly — the committed output and hash rules become the drift baseline for all future phases.
- **D-06:** Prove generated output is byte-identical under arm64 Docker and amd64 CI. Exclude genuinely architecture-dependent fields only with written documentation. There is **no override or allowlist**: any diff fails; the remedy is to regenerate, review, and commit, or to fix the writer or the exclusion. — **Reversibility:** costly — removing this gate would permit silent data drift into shipped builds.

### Model Conversion

- **D-07:** Convert the full Coriolis composite: hull, faceplate, tris, and dock as separate glTF nodes/meshes with local transforms, dock at `z = 500.2561` before the coordinate conversion. — **Reversibility:** costly — Phase 4 docking geometry and the letterbox acceptance test depend on these node transforms.
- **D-08:** Use approximate metallic-roughness PBR (metalness 0, roughness derived from gloss), preserve original Oolite gloss/shininess/specular in `extras.oolite`, and bake a separate greyscale emissive PNG from the alpha channel at build time. — **Reversibility:** reversible — source values are preserved in `extras.oolite`, so the material model can be refined without re-extracting the snapshot.
- **D-09:** Preserve full source semantics: per-face normals by default; smoothGroup averaging only when `smooth = yes`; UV = texel units divided by declared texture size; V-flip decided by an asymmetric fixture; Oolite +Z-forward → Three −Z-forward by negating Z on positions and normals and reversing triangle winding; bounding-box assertions for Cobra and Coriolis. Use `oolite_cobra3.dat`, not `cobra3_redux.dat`. — **Reversibility:** costly — changing the convention invalidates fixtures, bounding-box assertions, and the orientation assumptions in Phases 3 and 4.

### Catalogue & Content Shape

- **D-10:** Ingest every `equipment.plist` entry with its metadata (conditions, `requires_*` flags, tech level, price) but do not evaluate Oolite condition scripts; Phase 5 filters to the v1-functional set. — **Reversibility:** reversible — the catalogue is additive and metadata can be ignored downstream.
- **D-11:** Parse the full `shipdata.plist` into a typed catalogue with `like_ship` resolution, but emit GLBs only for the Cobra Mk III and the Coriolis composite. — **Reversibility:** reversible — additional ships can be converted later without changing the catalogue shape.
- **D-12:** Use `g{galaxy}-s{index}` (for example `g0-s7` for Lave) as the stable system ID, alongside numeric `galaxy` and `systemIndex` fields. — **Reversibility:** costly — once saves persist location, changing the ID format requires a save migration.
- **D-13:** Represent commodity money as integer decicredits with explicit unit tags (`t`, `kg`, `g`) and pod-conversion metadata; include Alien Items with `tradeable = false`. — **Reversibility:** costly — ECON-02/ECON-03 and save data depend on these units and flags.
- **D-14:** Emit systems as per-galaxy JSON chunks (`g0.json` … `g7.json`); galaxy 0 is eager, the rest are dynamically imported and code-split by Vite. — **Reversibility:** reversible — chunking is a build/loading detail, not a data contract.
- **D-15:** Validate every parsed file and emitted record with zod at build time; at runtime validate only the small manifest on startup and fail loudly on a missing or mismatched entry. — **Reversibility:** reversible — validation depth can change without altering content shape.
- **D-16:** Generated content lives in `src/content/` as JSON modules. A zod schema is the single source of truth for types (`z.infer`), so records and types cannot drift. The sim imports type-only from `src/content/types` and receives loaded data through the app boundary. — **Reversibility:** costly — the import boundary, ESLint sim zone, and sim function signatures all depend on this layout.

### Failure Contract

- **D-17:** Use one structured `ContentError` carrying `code` (`PLIST_PARSE`, `LIKE_SHIP_CYCLE`, `DAT_MESH`, `SCHEMA`), repository-relative file, construct (key/template/mesh block), line and column where available, and a short offending excerpt. The CLI prints it and exits non-zero; tests assert code + file + construct. — **Reversibility:** reversible — the error type can gain fields without breaking callers.
- **D-18:** Fail fast on the first structural error per run with a precise location. Cross-file failures such as a `like_ship` cycle still print the whole chain so the cause is visible. — **Reversibility:** reversible — aggregation can be added later.
- **D-19:** Keep one checked-in fixture per failure class: malformed plist, cyclic `like_ship` chain, broken `.dat`, and schema-invalid record. Tests assert error code, file, construct, and line/column. — **Reversibility:** reversible — fixtures are test-only.

### Textures

- **D-20:** Copy the original PNGs verbatim for materials referenced by the Cobra Mk III and Coriolis shipdata entries, plus the baked greyscale emissive PNG. Vendor only referenced textures. No KTX2/Basis compression in Phase 2. — **Reversibility:** reversible — a compressed pipeline can be added later from the same sources.
- **D-21:** A referenced-but-missing or unreadable texture fails the build with a `ContentError` naming the file, the referencing ship/material, and the expected snapshot path. No placeholders or silent substitution. — **Reversibility:** reversible — policy can loosen, but should not.

### Systems & Economy Metadata

- **D-22:** Compile every `planetinfo.plist` field for all 2,048 systems exactly as authored, typed, preserving absent versus present values. — **Reversibility:** reversible — additive fields and values can be consumed incrementally.
- **D-23:** Compile `descriptions.plist` economy, government, and tech-level label arrays plus system description templates into typed content now. Do not make UI decisions yet. — **Reversibility:** reversible — labels are read-only data.
- **D-24:** Preserve `market_definition` as tri-state metadata: absent, empty array, or explicit definitions. Do not compute prices or stock; Phase 5 owns the economy formula. — **Reversibility:** reversible — the raw distinction is preserved for Phase 5.
- **D-25:** Store raw Oolite values (including raw tech level); apply presentation adjustments such as the +1 tech-level display at render time. — **Reversibility:** reversible — display logic can change without altering content.

### Agent's Discretion

- Exact module and file names under `tools/oolite-ingest/` and `src/content/`.
- Zod schema organisation and whether schemas live beside converters or in a shared package.
- GLB `extras.oolite` field layout beyond preserving the original material values.
- CLI flag names, help text, and progress output.
- Fixture file names and directory layout.
- Exact `ContentError` code strings beyond the four required classes.
- Manifest field ordering and whether per-file hashes live in `manifest.json` or a sibling file.
- Whether the GLB writer uses `@gltf-transform/core` directly or a small in-repo writer.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Phase Intent

- `.planning/PROJECT.md` — scope, constraints, licensing, and accumulated key decisions.
- `.planning/REQUIREMENTS.md` — DATA-01 through DATA-09, plus ECON-02, ECON-03, SAVE-02, and QUAL-06.
- `.planning/ROADMAP.md` — Phase 2 goal, dependencies, research flags, and success criteria.
- `.planning/STATE.md` — current status and the cross-architecture byte-determinism blocker.

### Prior Phase Contracts

- `.planning/phases/01-foundation-containers-compliance/01-CONTEXT.md` — D-01 through D-12: Docker stages, `verify` chain, determinism, canonical serialization, FNV-1a hashing, golden fixtures, and Node-only Vitest.
- `AGENTS.md` — Docker-only workflow, sim purity, licensing, and GSD workflow enforcement.

### Research

- `.planning/research/STACK.md` — approved parser/tooling choices, `@gltf-transform/core`, `tsx`, `fast-check`, and rejected alternatives.
- `.planning/research/ARCHITECTURE.md` — plist and `.dat` grammar, coordinate conversion, manifest design, and build-time compilation pattern.
- `.planning/research/PITFALLS.md` — unit traps, `like_ship` overlay order, `.dat`/Coriolis traps, emissive alpha handling, and bounding boxes.
- `.planning/research/FEATURES.md` — commodity, equipment, system, and save-data semantics that Phase 2 must preserve.

### Repository Entry Points

- `package.json` — scripts and dependency versions that `assets:build` / `assets:check` extend.
- `tsconfig.json`, `tsconfig.sim.json` — typecheck boundaries; root config already includes `tools/**/*.ts`.
- `eslint.config.js` — sim import zones; the sim may import only `src/sim` and `content/types`.
- `vite.config.ts` — base path, chunking, and build target for per-galaxy splitting.
- `vitest.config.ts` — Node-only unit project and test include globs.
- `compose.yaml`, `Dockerfile` — where `assets:check` joins the `verify` chain and where the ingest toolchain must be installed.
- `ASSETS.md` — per-file Oolite provenance table to populate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `src/sim/hash.ts` — in-repo FNV-1a hashing; reuse its approach for manifest or fixture hashing where `node:crypto` is disallowed in sim-facing code.
- `src/sim/state.ts` — canonical labelled-key serialization pattern; mirror its discipline (fixed number formatting, stable key order, no `JSON.stringify` reliance) for canonical content output.
- `tests/golden/` — checked-in golden fixture pattern; extend with Lave, commodity, equipment, ship, and mesh fixtures.
- `tests/guards/sim-purity.test.ts` — existing purity guard; extend or mirror it for the `src/content` boundary.
- `tsconfig.sim.json` — proves the sim can be typechecked against a DOM-free, Three-free surface.
- `compose.yaml` `verify` service — the single fail-fast chain where `assets:check` must be inserted.

### Established Patterns

- Build-time compilation: never ship plists, `.dat` files, or runtime parsers.
- Determinism: fixed inputs, canonical output, checked-in goldens, and explicit drift failure.
- Sim purity: the simulation is pure TypeScript, fixed-timestep, DOM-free, and Three-free.
- Node-only Vitest: browser behavior is covered only by Playwright.
- Fail-fast CI: one `verify` service with ordered stages.
- Schema-derived types: one source of truth, no parallel hand-written interfaces.

### Integration Points

- `package.json` scripts: add `assets:build` and `assets:check`, and insert `assets:check` into `verify`.
- `vite.config.ts`: support per-galaxy dynamic imports and correct static asset URLs under `base: './'`.
- `eslint.config.js`: point the sim's allowed content import at the new `src/content/types` path.
- `src/main.ts` / `src/render/`: later phases load GLBs through `GLTFLoader`; Phase 2 only needs to produce and assert them.
- `ASSETS.md` and `NOTICE`: record every vendored and generated asset.

</code_context>

<specifics>
## Specific Ideas

- **Lave fixture:** assert Lave (`planetinfo` key `"0 7"`, stable ID `g0-s7`) against pinned values for name, coordinates, economy, government, raw tech level, population, productivity, radius, description, station/sun vectors, and `market_definition`.
- **Coriolis letterbox:** the dock's visible opening must read correctly, not mirrored. Assert orientation through an asymmetric texture fixture rather than a screenshot.
- **Bounding boxes:** `oolite_cobra3.dat` approximately 130×35×81; Coriolis hull 1000×1000×~996; dock approximately 103×242×250 with a visible opening near 192×64.
- **Unit traps:** `trade-goods.plist` and `equipment.plist` prices are decicredits (food `50` = 5.0 Cr; missile `300` = 30.0 Cr); `shipyard.plist` prices are credits (Cobra `150000` = 150,000 Cr); `planetinfo.plist` radius is km and is scaled ×10 for game units.
- **Display adjustment:** raw tech level is stored; the UI adds 1 only when presenting F7-style system data.
- **Coordinate conversion:** Oolite +Z forward becomes Three −Z forward; the dock authored at `z = +500.2561` lands at `z = −500.2561`.
- **Texture orientation:** Three's `Texture.flipY` defaults to true; decide the converter's V-flip with the asymmetric fixture before baking anything.
- **Overlay order:** base entry → `like_ship` template → variant → `shipdata-overrides.plist`.

</specifics>

<deferred>
## Deferred Ideas

- Economy price/stock formula, per-system market generation, and the 127-unit stock cap — Phase 5 / ECON-01.
- Oolite condition-script evaluation — out of scope; Phase 5 filters using preserved metadata instead.
- KTX2/Basis texture compression — revisit in Phase 7 if download size or GPU memory demands it.
- GLBs for ships beyond the Cobra Mk III and Coriolis composite — later phases, using the same catalogue and converter.
- Binary or XML plist support — not needed for the pinned snapshot.
- OXP support — permanently out of scope for v1.

</deferred>

---

*Phase: 2-Data Pipeline & Content Compiler*
*Context gathered: 2026-11-03*
