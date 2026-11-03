# Phase 2: Data Pipeline & Content Compiler — Research

**Researched:** 2026-11-03
**Domain:** Build-time content compilation (OpenStep plists, Oolite `.dat` meshes, glTF/GLB authoring, deterministic output gates) in TypeScript inside Docker
**Confidence:** HIGH for the Oolite data/format/semantics findings (every claim was read out of the pinned tree at `7437f22` this session); MEDIUM for the cross-architecture byte-determinism plan (the mechanism is sound, the arm64↔amd64 equality is not yet demonstrated); HIGH for the in-repo integration constraints (they were read out of the working tree).

> **Research method note.** `brave_search`, `firecrawl`, `exa_search`, `tavily`, `ref`, `perplexity` and `jina` are all `false` in `.planning/config.json`, so the `research-plan` seam has no web provider to route to. The primary sources for this phase are not search results — they are the files themselves. I fetched the pinned Oolite tree at commit `7437f22` directly (`raw.githubusercontent.com`, `api.github.com`), downloaded all 40 `Resources/Config/*.plist` files plus the five `.dat` models and four textures, and ran a reference OpenStep tokenizer/parser over the whole corpus to enumerate the grammar features actually present. All Oolite citations below are from that pinned tree, not from memory or from the project's earlier research files.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Snapshot & Provenance

- **D-01:** Vendor a committed subset of Oolite under `third_party/oolite/`, with every vendored file recorded per-file in `ASSETS.md`. Vendor all `Resources/Config/*.plist` plus only the Cobra Mk III and Coriolis composite `.dat` files and textures that Phase 2 compiles. — **Reversibility:** costly — changing the snapshot layout invalidates generator input paths, manifest entries, `ASSETS.md` hashes, and the reviewed drift baseline.
- **D-02:** Pin Oolite `1.93.1-241` at commit `7437f22` (the audited research snapshot). Later releases enter only through a deliberate bump. The bump script re-extracts at the new ref, rewrites `ASSETS.md` hashes and the manifest, regenerates content, and leaves `verify` failing until every diff is reviewed and committed. — **Reversibility:** costly — the pin underpins golden fixtures and any later save/content compatibility expectations.
- **D-03:** Keep raw `.dat`, `.plist`, and PNG sources in the repo as the preferred form. Generated GLBs are derivative CC BY-NC-SA works: ship `LICENSE-oolite.txt` and attribution, never relicense them as GPL/MIT. — **Reversibility:** one-way — licensing and provenance obligations attach to every distributed copy and cannot be undone after publication.

#### Build & Drift Gate

- **D-04:** `assets:build` writes generated output; `assets:check` regenerates into a temporary directory and diffs. `verify` runs `lint → typecheck → assets:check → test → build → e2e`, fail-fast, with `assets:check` before `build`. — **Reversibility:** costly — the gate position and output contract are wired into Compose, CI, and every later content change.
- **D-05:** Commit all generated output (typed JSON, GLBs, copied textures, manifest). Compare canonical bytes plus per-file SHA-256. Canonical JSON uses sorted keys, fixed number formatting, LF, and no timestamps; deterministic GLB uses fixed buffer ordering and no generator/time metadata. — **Reversibility:** costly — the committed output and hash rules become the drift baseline for all future phases.
- **D-06:** Prove generated output is byte-identical under arm64 Docker and amd64 CI. Exclude genuinely architecture-dependent fields only with written documentation. There is **no override or allowlist**: any diff fails; the remedy is to regenerate, review, and commit, or to fix the writer or the exclusion. — **Reversibility:** costly — removing this gate would permit silent data drift into shipped builds.

#### Model Conversion

- **D-07:** Convert the full Coriolis composite: hull, faceplate, tris, and dock as separate glTF nodes/meshes with local transforms, dock at `z = 500.2561` before the coordinate conversion. — **Reversibility:** costly — Phase 4 docking geometry and the letterbox acceptance test depend on these node transforms.
- **D-08:** Use approximate metallic-roughness PBR (metalness 0, roughness derived from gloss), preserve original Oolite gloss/shininess/specular in `extras.oolite`, and bake a separate greyscale emissive PNG from the alpha channel at build time. — **Reversibility:** reversible — source values are preserved in `extras.oolite`, so the material model can be refined without re-extracting the snapshot.
- **D-09:** Preserve full source semantics: per-face normals by default; smoothGroup averaging only when `smooth = yes`; UV = texel units divided by declared texture size; V-flip decided by an asymmetric fixture; Oolite +Z-forward → Three −Z-forward by negating Z on positions and normals and reversing triangle winding; bounding-box assertions for Cobra and Coriolis. Use `oolite_cobra3.dat`, not `cobra3_redux.dat`. — **Reversibility:** costly — changing the convention invalidates fixtures, bounding-box assertions, and the orientation assumptions in Phases 3 and 4.

#### Catalogue & Content Shape

- **D-10:** Ingest every `equipment.plist` entry with its metadata (conditions, `requires_*` flags, tech level, price) but do not evaluate Oolite condition scripts; Phase 5 filters to the v1-functional set. — **Reversibility:** reversible — the catalogue is additive and metadata can be ignored downstream.
- **D-11:** Parse the full `shipdata.plist` into a typed catalogue with `like_ship` resolution, but emit GLBs only for the Cobra Mk III and the Coriolis composite. — **Reversibility:** reversible — additional ships can be converted later without changing the catalogue shape.
- **D-12:** Use `g{galaxy}-s{index}` (for example `g0-s7` for Lave) as the stable system ID, alongside numeric `galaxy` and `systemIndex` fields. — **Reversibility:** costly — once saves persist location, changing the ID format requires a save migration.
- **D-13:** Represent commodity money as integer decicredits with explicit unit tags (`t`, `kg`, `g`) and pod-conversion metadata; include Alien Items with `tradeable = false`. — **Reversibility:** costly — ECON-02/ECON-03 and save data depend on these units and flags.
- **D-14:** Emit systems as per-galaxy JSON chunks (`g0.json` … `g7.json`); galaxy 0 is eager, the rest are dynamically imported and code-split by Vite. — **Reversibility:** reversible — chunking is a build/loading detail, not a data contract.
- **D-15:** Validate every parsed file and emitted record with zod at build time; at runtime validate only the small manifest on startup and fail loudly on a missing or mismatched entry. — **Reversibility:** reversible — validation depth can change without altering content shape.
- **D-16:** Generated content lives in `src/content/` as JSON modules. A zod schema is the single source of truth for types (`z.infer`), so records and types cannot drift. The sim imports type-only from `src/content/types` and receives loaded data through the app boundary. — **Reversibility:** costly — the import boundary, ESLint sim zone, and sim function signatures all depend on this layout.

#### Failure Contract

- **D-17:** Use one structured `ContentError` carrying `code` (`PLIST_PARSE`, `LIKE_SHIP_CYCLE`, `DAT_MESH`, `SCHEMA`), repository-relative file, construct (key/template/mesh block), line and column where available, and a short offending excerpt. The CLI prints it and exits non-zero; tests assert code + file + construct. — **Reversibility:** reversible — the error type can gain fields without breaking callers.
- **D-18:** Fail fast on the first structural error per run with a precise location. Cross-file failures such as a `like_ship` cycle still print the whole chain so the cause is visible. — **Reversibility:** reversible — aggregation can be added later.
- **D-19:** Keep one checked-in fixture per failure class: malformed plist, cyclic `like_ship` chain, broken `.dat`, and schema-invalid record. Tests assert error code, file, construct, and line/column. — **Reversibility:** reversible — fixtures are test-only.

#### Textures

- **D-20:** Copy the original PNGs verbatim for materials referenced by the Cobra Mk III and Coriolis shipdata entries, plus the baked greyscale emissive PNG. Vendor only referenced textures. No KTX2/Basis compression in Phase 2. — **Reversibility:** reversible — a compressed pipeline can be added later from the same sources.
- **D-21:** A referenced-but-missing or unreadable texture fails the build with a `ContentError` naming the file, the referencing ship/material, and the expected snapshot path. No placeholders or silent substitution. — **Reversibility:** reversible — policy can loosen, but should not.

#### Systems & Economy Metadata

- **D-22:** Compile every `planetinfo.plist` field for all 2,048 systems exactly as authored, typed, preserving absent versus present values. — **Reversibility:** reversible — additive fields and values can be consumed incrementally.
- **D-23:** Compile `descriptions.plist` economy, government, and tech-level label arrays plus system description templates into typed content now. Do not make UI decisions yet. — **Reversibility:** reversible — labels are read-only data.
- **D-24:** Preserve `market_definition` as tri-state metadata: absent, empty array, or explicit definitions. Do not compute prices or stock; Phase 5 owns the economy formula. — **Reversibility:** reversible — the raw distinction is preserved for Phase 5.
- **D-25:** Store raw Oolite values (including raw tech level); apply presentation adjustments such as the +1 tech-level display at render time. — **Reversibility:** reversible — display logic can change without altering content.

### the agent's Discretion

- Exact module and file names under `tools/oolite-ingest/` and `src/content/`.
- Zod schema organisation and whether schemas live beside converters or in a shared package.
- GLB `extras.oolite` field layout beyond preserving the original material values.
- CLI flag names, help text, and progress output.
- Fixture file names and directory layout.
- Exact `ContentError` code strings beyond the four required classes.
- Manifest field ordering and whether per-file hashes live in `manifest.json` or a sibling file.
- Whether the GLB writer uses `@gltf-transform/core` directly or a small in-repo writer.

### Deferred Ideas (OUT OF SCOPE)

- Economy price/stock formula, per-system market generation, and the 127-unit stock cap — Phase 5 / ECON-01.
- Oolite condition-script evaluation — out of scope; Phase 5 filters using preserved metadata instead.
- KTX2/Basis texture compression — revisit in Phase 7 if download size or GPU memory demands it.
- GLBs for ships beyond the Cobra Mk III and Coriolis composite — later phases, using the same catalogue and converter.
- Binary or XML plist support — not needed for the pinned snapshot.
- OXP support — permanently out of scope for v1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md) | Research Support |
|----|-------------------------------|------------------|
| DATA-01 | A build-time OpenStep ASCII plist parser handles comments, unquoted keys, nested dictionaries/arrays, and fails with actionable parse errors | §P2 grammar table is enumerated from all 40 vendored files (7,234 line comments, 212 block comments, 91,618 bare keys, 10,644 quoted keys, 2,297 of them with special characters, octal escapes, UTF-8 literals, max depth 6, duplicate keys last-wins). Line/column tracking requirement is explicit in §P2.4. |
| DATA-02 | `like_ship`/template inheritance resolves with cycle detection and per-key overrides | §P3 reproduces Oolite's real algorithm verbatim from `OOShipRegistry.m`: shallow child-over-parent merge, three non-inheritable keys, five alias-conflict pairs, and the overrides-before-resolution stage order. Measured on the pinned file: 194 entries, 137 with `like_ship`, max depth 3, 81 templates. |
| DATA-03 | A `.dat` mesh parser reads `NVERTS`/`NFACES`/`VERTEX`/`FACES`/`TEXTURES`/`END`, truncates faces above three vertices, and produces per-face normals | §P4: exact section grammar, the **comma separator** used by the Coriolis files, zero face normals on the Cobra, the `NORMALS` explicit mode, and the truncation/`<3` rules read from `OOMesh.m:1208-1300`. |
| DATA-04 | The converter emits GLB plus a content manifest, applying the Oolite +Z-forward to Three −Z-forward coordinate and winding conversion verified by fixture | §P5 derives and *empirically confirms* the winding fact on all four Coriolis meshes (0/2,226 faces agree with the standard right-hand normal; all 2,226 agree with Oolite's negated convention), which is why "negate Z and reverse winding" is simultaneously correct for axes and for glTF front-face order. §P6 covers the manifest. |
| DATA-05 | All 2,048 systems across all eight galaxies are ingested from `planetinfo.plist` with stable IDs, names, and positions | §The Pinned Data → Systems: 2,050 top-level keys = 2,048 systems + `"universal"` + `"interstellar space"`; 40 keys present on every system; `percent_cloud` present only on Lave (the present-vs-absent fixture); Lave's pinned values are quoted verbatim. |
| DATA-06 | All 17 commodities are ingested from `trade-goods.plist` with correct units (decicredits, kg, g), and Alien Items are parsed but never tradeable | §The Pinned Data → Commodities: 17 keys, `quantity_unit` 0/1/2 = t/kg/g, all prices integer decicredits, Alien Items present with zero quantity fields. |
| DATA-07 | Cobra Mk III, Coriolis station, equipment catalogue, and Lave starting-system data are available as typed, compiled content | §Pattern 3 + §Pattern 5 (ships), §The Pinned Data → Equipment (41 positional tuples), §The Pinned Data → Systems (Lave). |
| DATA-08 | Golden fidelity tests compare generated content against a pinned Oolite snapshot, and the build fails on unexplained drift | §Pattern 6 canonical/manifest design, §Validation Architecture test map. |
| DATA-09 | The Oolite source snapshot is pinned to a specific release/commit and recorded in the repository | §Pattern 1 vendoring layout, `ASSETS.md` row contract, deliberate bump script. |
</phase_requirements>

## Summary

Phase 2 is not "write a parser". It is **nine small converters plus one gate**, and the gate is the part that makes every later phase trustworthy. The research below therefore concentrates on the three things that are expensive to get wrong and cheap to verify now: the exact Oolite semantics (which are frequently *not* what the project's earlier research assumes), the exact byte-production rules, and the exact coupling to the Phase 1 contracts that already pin this repository in place.

Four findings dominate the plan:

1. **The `.dat` and plist data disagree with the prose in `PITFALLS.md`/`CONTEXT.md` in three specific, load-bearing ways.** (a) The Coriolis `.dat` files use **commas as separators**; the Cobra does not. (b) The Cobra's per-face normals are **all zero**, and it carries a `NORMALS` block of one normal per *vertex* — Oolite selects an `explicit` normal mode for it, so a converter that hardcodes "per-face normals" produces a different silhouette from Oolite. (c) Oolite applies `shipdata-overrides.plist` **before** `like_ship` resolution, not after, and its merge is **shallow** with three non-inheritable keys and five alias-conflict pairs. Each of these is one line of code if known and a silent fidelity bug if not.

2. **The winding conversion is provable, not a convention to pick.** Every one of the 2,226 faces in the four Coriolis meshes has a stored normal that is the *negation* of the standard right-hand normal for its index order. Negating Z (a reflection, `det = -1`) maps `cross(Ma, Mb)` to `-M·n`, so the same operation that converts +Z-forward to −Z-forward also converts Oolite's clockwise-facing index order into glTF's required counter-clockwise order **provided the winding is reversed**. The two requirements coincide; there is no second decision.

3. **The Phase 1 contracts are a minefield of exact-string assertions.** `tests/contract/container-contract.test.ts` pins the `verify` chain byte-for-byte, pins the `lint`, `typecheck`, `test` and `test:e2e` script strings byte-for-byte, and requires the set of `docker compose run --rm` targets documented in `AGENTS.md` and `README.md` to equal the Compose service set exactly. `tests/compliance.test.ts` walks every `.ts`/`.js`/`.sh` file in the tree for an SPDX header. And `prettier --check .` runs inside `lint` over generated JSON — so `src/content/generated/` must be in `.prettierignore` or every build fails lint. None of this is hard, but all of it must be in the same plan as the thing it breaks.

4. **Byte determinism is a discipline, not a library feature.** Almost nothing in this pipeline is genuinely architecture-dependent *if* you ban five things: transcendental `Math` functions, `localeCompare`/`Intl`, unsorted directory reads, `toFixed` on values that are not already exact, and unpinned encoders. What remains is one real unknown — the zlib-compressed PNG the emissive bake produces — and the answer is an explicit probe rather than an assumption.

**Primary recommendation:** build the pipeline as a **tracer first** (snapshot → parser → 17 commodities → canonical JSON + manifest → `assets:check` wired into `verify`), then add converters in dependency order, with the `.dat`/GLB work after all the plist work. Use an **in-repo GLB writer** (≈150 lines, byte layout under our control) and `@gltf-transform/core` only as an independent *reader* in tests. Emit the shipdata catalogue as a typed projection with the remainder preserved under `extras`, not as 194 fully-inlined dictionaries.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Snapshot vendoring & provenance | Build-time toolchain (`third_party/`, `tools/oolite-ingest/`, `ASSETS.md`) | — | Inputs are data files; nothing at runtime may read a plist or `.dat` (ARCHITECTURE.md anti-pattern 6). |
| OpenStep parsing, `like_ship` resolution, `.dat` parsing | Build-time toolchain | — | String parsing belongs in Node, where CI can fail it and where tests can run in milliseconds. |
| Coordinate/winding/normal/UV conversion | Build-time toolchain (geometry) | Runtime render (`src/render/`) consumes the result | One conversion, at the boundary, so no runtime code ever re-derives it. |
| Typed content (systems, commodities, equipment, ships, labels) | Content boundary (`src/content/`) | Simulation (type-only import) | D-16: zod is the single source of truth; the sim receives data through the app boundary. |
| Model + texture bytes (GLB, PNG) | Static assets (`public/models/`, `public/textures/`) | Runtime loader (`three/addons/loaders/GLTFLoader`) | Assets are fetched by URL, never parsed by the app. |
| Content manifest validation | App boundary at startup | — | D-15: only the manifest is validated at runtime; the records are trusted because the build validated them. |
| Drift gate | CI / Compose (`verify`) | — | `assets:check` is the only place that decides whether committed output matches regenerated output. |
| Licensing/provenance enforcement | Build-time toolchain + `tests/compliance.test.ts` | — | Every vendored byte has an `ASSETS.md` row; generated GLBs stay CC BY-NC-SA. |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js (container) | `node:24-bookworm-slim` @ `sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c` | Runs the ingest toolchain | Already the project's only runtime; `tools/**/*.ts` is already in the root tsconfig. `[VERIFIED: Dockerfile:7]` |
| TypeScript | `6.0.2` | Types for the toolchain | The exact version `typescript-eslint@8.72.1` accepts; do **not** add a second compiler (Phase 1 verified the `.bin/tsc` collision). `[VERIFIED: package.json:30]` |
| `zod` | `4.6.7` | Schemas + `z.infer` types | D-15/D-16 make zod the single source of truth. Published 2026-10-12; 444.5 M downloads/week; repo `colinhacks/zod`; no `postinstall`. `[VERIFIED: npm registry + gsd-tools package-legitimacy check]` |
| `tsx` | `4.23.15` | Executes `tools/oolite-ingest/cli.ts` | Approved in `STACK.md`. Node 24's native type stripping cannot be used here because this repo imports with explicit `.js` specifiers (`import { canon } from "./hash.js"`), which type stripping resolves literally and fails. `[VERIFIED: npm registry; src/sim/state.ts:4]` |
| `@gltf-transform/core` | `4.5.1` | **Test-time** GLB reader/validator | Used as the independent second opinion, not the producer — see §P5.5. `NodeIO.readBinary` / `writeBinary` confirmed present in the shipped `dist/index.d.ts`. `[VERIFIED: npm registry + package tarball]` |
| `fast-check` | `4.10.2` | Property tests for parser and resolver | Approved in `STACK.md`; complements example-based fixtures. Published 2026-09-19, 77.0 M downloads/week, repo `dubzzz/fast-check`. `[VERIFIED: npm registry + package-legitimacy check]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:crypto` (`createHash('sha256')`) | built-in | Per-file manifest hashes | Toolchain only. The sim keeps its in-repo FNV-1a; never import `node:crypto` from `src/sim`. `[VERIFIED: src/sim/hash.ts:1-21]` |
| `node:zlib` | built-in | Deflate for the baked emissive PNG | Only inside the texture baker — see §P6.4 for the determinism rule. |
| `node:fs/promises` | built-in | Reading the snapshot, writing output, diffing temp dirs | Toolchain only. |

**Deliberately not installed:** `@plist/openstep.parse` (write the ~250-line parser; `STACK.md` already rejects it), `plist` (XML/binary only), `gl-matrix`, any YAML parser for Compose (Phase 1 already parses it by hand in a test), any image library (`pngjs`, `sharp`) — the emissive bake only needs an alpha channel from a non-interlaced 8-bit RGBA PNG, which is ~40 lines of `zlib.inflateSync` + row unfiltering.

**Installation (inside the image build only):**

```bash
npm install zod@4.6.7
npm install -D tsx@4.23.15 fast-check@4.10.2 @gltf-transform/core@4.5.1
docker compose build && docker compose down --volumes   # D-04 rule from AGENTS.md
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-repo GLB writer | `@gltf-transform/core` `NodeIO.writeBinary` | Works, and is already approved — but it writes `asset.generator = "glTF-Transform 4.5.1"` on every document, so **any** upgrade of that package re-baselines every committed GLB. It also owns key ordering inside the JSON chunk. Both are manageable only by overriding the generator string, at which point the remaining benefit is small. |
| `tsx` | `node --experimental-strip-types tools/.../cli.ts` | Node 24 strips types natively, but not extension rewriting: `import x from "./y.js"` fails when the only file is `y.ts`. Adopting it means either changing the repo's import style or writing `.ts` specifiers in tools only, which the root tsconfig's `moduleResolution: "bundler"` accepts but which reads inconsistently. |
| `zod` record schemas at runtime | Validate only at build, ship bare JSON | D-15 explicitly wants the small manifest validated at startup. Mismatched manifest ↔ file is the failure mode that produces an unexplainable blank screen. |
| Vendoring all 40 Config plists | Vendor only the 6 consumed | D-01 is locked, and there is a real benefit: parsing all 40 is a free, 40-file parser regression suite (`§P2.1`). Cost is 3.5 MB in the repo and image. |

### Version verification (run 2026-11-03 against the npm registry)

```bash
npm view zod version                 # 4.6.7
npm view @gltf-transform/core version # 4.5.1
npm view tsx version                 # 4.23.15   engines: node >=18.0.0
npm view fast-check version          # 4.10.2    engines: node >=12.17.0
```

## Package Legitimacy Audit

`gsd-tools query package-legitimacy check --ecosystem npm zod @gltf-transform/core tsx fast-check` (run 2026-11-03):

| Package | Registry | Newest release | Downloads/wk | Source repo | Verdict | Disposition |
|---------|----------|----------------|--------------|-------------|---------|-------------|
| `zod` | npm | 2026-10-12 | 444,545,419 | github.com/colinhacks/zod | **SUS** (`too-new`) | Approved — recency-only flag on a top-100 package; same treatment Phase 1 gave `three`/`vite`/`vitest` |
| `@gltf-transform/core` | npm | 2026-09-28 | 1,268,134 | github.com/donmccurdy/glTF-Transform | OK | Approved |
| `tsx` | npm | 2026-09-20 | 131,780,889 | github.com/privatenumber/tsx | OK | Approved |
| `fast-check` | npm | 2026-09-19 | 76,979,277 | github.com/dubzzz/fast-check | OK | Approved |

No package returned `SLOP`. No package has a `postinstall` script (`signals.postinstall` was `null` for all four). `[VERIFIED: gsd-tools query package-legitimacy check]`

*Packages removed due to `[SLOP]` verdict:* none.
*Packages flagged `[SUS]`:* `zod` only, on recency. Phase 1 already established that a single consolidated `checkpoint:human-verify` covering the version set is the right shape rather than one checkpoint per package; carry that precedent forward.

---

## Architecture Patterns

### System Architecture Diagram

```
 third_party/oolite/            tools/oolite-ingest/                     src/content/ + public/
 ┌────────────────────┐        ┌──────────────────────────────┐         ┌──────────────────────────┐
 │ Config/*.plist (40)│──read──▶ openstep.ts  (tokenize→parse) │         │ generated/               │
 │ Models/*.dat  (5)  │        │   │                          │         │  commodities.json        │
 │ Textures/*.png (18)│        │   ├─▶ like-ship.ts  merge     │         │  equipment.json          │
 │ SOURCE.md (pin)    │        │   ├─▶ ships.ts     project    │──emit──▶│  ships.json              │
 └────────────────────┘        │   ├─▶ systems.ts   chunk     │  zod    │  labels.json             │
                               │   ├─▶ equipment.ts            │  vlaid. │  systems/g0..g7.json     │
            ┌──────────────────│   ├─▶ dat.ts        parse     │         │  manifest.json           │
            │                  │   ├─▶ glb.ts        write     │         │ public/models/*.glb      │
            ▼                  │   ├─▶ textures.ts   copy+bake │         │ public/textures/*.png    │
   ContentError(code,file,     │   └─▶ manifest.ts   sha256    │         └────────────┬─────────────┘
   construct,line,col,excerpt) └──────────────┬───────────────┘                      │ type-only
            │                                 │                                        ▼
            │                       ┌─────────▼──────────┐                    ┌───────────────────┐
            └───── on first error ──▶│ cli.ts  (build|check)│                   │ src/sim/ (pure)   │
                                      └─────────┬──────────┘                    └───────────────────┘
                                                │
                        assets:build ───────────┴──────────── assets:check
                        writes in place                          regenerates into a temp dir,
                                                                 byte-compares + SHA-256,
                                                                 exits non-zero naming each file

  verify: lint → typecheck → assets:check → test → build → e2e        (compose.yaml, fail-fast `&&`)
```

Data flow for the primary use case: a vendored plist byte → token stream (with line/column) → AST → zod-validated typed record → canonical JSON string → committed file → SHA-256 manifest row → `assets:check` re-runs the identical function chain in a temp directory and compares bytes.

### Recommended Project Structure

```
third_party/oolite/                     # D-01: vendored subset, every file in ASSETS.md
├── SOURCE.md                           # release 1.93.1-241, commit 7437f22, date, retrieval command
├── LICENSE-oolite.txt                  # CC BY-NC-SA 3.0 text + attribution (D-03)
├── Config/*.plist                      # all 40, verbatim
├── Models/
│   ├── oolite_cobra3.dat
│   └── oolite_coriolis{,_faceplate,_tris,_dock}.dat
└── Textures/*.png                      # only the 18 referenced by those shipdata entries

tools/oolite-ingest/
├── cli.ts                              # assets:build / assets:check entry point
├── openstep/
│   ├── tokenizer.ts                    # line/column-tracking scanner
│   ├── parser.ts                       # recursive descent → PlistValue
│   ├── plist-value.ts                  # tagged union: dict|array|string|integer|real|bool|empty
│   └── index.ts
├── like-ship.ts                        # merge rules + cycle/dangling detection
├── canonical/
│   ├── json.ts                         # sorted keys, fixed number format, LF
│   └── hash.ts                         # sha256 helper (node:crypto)
├── convert/
│   ├── systems.ts   equipment.ts   ships.ts   labels.ts   commodities.ts
│   ├── dat.ts                          # .dat → ParsedMesh
│   ├── glb.ts                          # ParsedMesh + ShipDef → GLB bytes
│   └── textures.ts                     # copy + emissive bake
├── schemas/                            # zod: one module per entity
├── manifest.ts
└── content-error.ts

src/content/
├── types.ts                            # `import type` only; `z.infer` re-exports  (sim-visible)
├── schemas/*.ts                        # the zod objects themselves
├── generated/**                        # committed output (git + prettier-ignored)
└── index.ts                            # typed accessors + manifest assertion

public/
├── models/*.glb
└── textures/*.png
```

### Pattern 1: Vendored snapshot with a deliberate bump

**What:** `third_party/oolite/` holds exactly the bytes Phase 2 compiles, plus `SOURCE.md` naming release `1.93.1-241` and commit `7437f22`.
**When to use:** always; nothing is ever read from the network during a build.

Rules that fall out of the data:

- **`ASSETS.md` needs one row per file.** 40 plists + 5 models + 16 textures + `SOURCE.md` + `LICENSE-oolite.txt` = 63 rows, each with a SHA-256. The architecture test asserts the eight-column header at `ASSETS.md:13`; row count is free to grow.
- **Vendor only `.plist`, `.dat`, `.png`.** `tests/compliance.test.ts:42` limits the SPDX walk to `[".ts", ".js", ".sh"]`, but that walk covers the whole tree and `third_party` is **not** in its skip list (`node_modules`, `dist`, `test-results`, `playwright-report`, `.git`, `.planning`). A vendored `.js` would therefore fail compliance. `[VERIFIED: tests/compliance.test.ts:42,63-79]`
- **`.prettierignore` must gain `third_party`** so a future bump that vendors a formattable file cannot fail `lint` for a reason unrelated to our code. `[VERIFIED: .prettierignore:1-10]`
- **The bump script is three steps, in this order:** re-fetch at the new ref into a temp dir → rewrite `ASSETS.md` hashes + `SOURCE.md` → run `assets:build`. The build failing afterwards *is* the review: the committed generated output no longer matches, and the human reads the diff.

### Pattern 2: OpenStep ASCII plist parser

#### P2.1 The grammar subset that actually occurs

I ran a reference tokenizer over all 40 `Resources/Config/*.plist` at `7437f22`. This is the complete feature inventory — nothing below is hypothetical, and nothing absent is needed:

| Feature | Count / value | Consequence for the implementation |
|---------|---------------|------------------------------------|
| Top-level type | 30 dictionaries, 10 arrays | Both must be legal roots. `PlistValue` is a union, not a dict. |
| `//` line comments | 7,234 | Inside dicts, arrays, and between a key and `=`. |
| `/* */` block comments | 212 | Must nest-safely scan to `*/`; may span lines. |
| Bare keys | 91,618 | `[A-Za-z0-9_.\-/+:$]` covers every one observed. |
| Quoted keys | 10,644 | 2,297 contain characters outside that class — spaces (`"0 7"`, `"market_monitored"`, `"[@beep]"`), brackets, `@`, `*`. |
| Quoted strings | 45,159 | Escapes in §P2.2. |
| Bare integers | 27,900 | Optional leading `-`; **no** `+`. |
| Bare reals | 26,169 | `-?\d*\.\d+`; **no** exponents, no `1.`, no `.5`. |
| Bare booleans | 889 | `yes` / `no` only (lowercase in the corpus). |
| Bare atoms | 316 | Unquoted words used as strings: `type = flasher;`, `laser_color = magentaColor;`, `WEAPON_PULSE_LASER`, `smooth = yes`. Must parse as strings, not error. |
| Empty arrays | 5 | All five are `market_definition = ( // comments )` — a comment-only array. Must yield `[]` and must be distinguishable from absent. |
| Empty dictionaries | 1 | `gui-settings.plist` is a file whose entire body is commented out: it parses to `{}`. A vendored file that yields an empty dict must not be an error. |
| Nesting depth | max 6 | Recursion is safe; no explicit depth guard needed beyond a sanity cap (say 64). |
| Duplicate keys | 111 (all inside `keymappings_{linux,mac,windows}.plist`) | Must be **last-wins**, not an error — GNUstep's `NSMutableDictionary` semantics. |
| `<hex>` data blobs | 0 | Not needed. Explicitly out of scope per CONTEXT (binary/XML plists deferred). |
| CRLF / BOM | 0 / 0 | Treat `\r\n` as whitespace anyway; strip a leading BOM defensively. |
| Non-ASCII literals | 506 occurrences | UTF-8: `☆`, `★`, `–`, and a non-breaking space used as a value. Read UTF-8; emit UTF-8 (no `\u` escaping) so byte output is predictable. |

`[VERIFIED: full-corpus tokenizer run over 40 files fetched from raw.githubusercontent.com/OoliteProject/oolite/7437f22/Resources/Config/]`

#### P2.2 Escape sequences

| Escape | Occurrences | Decode as |
|--------|-------------|-----------|
| `\n` | 359 | LF |
| `\\` | 40 | backslash |
| `\t` | 36 | TAB |
| `\0` (part of `\000`–`\037`) | 18 | **octal** — control characters used as Oolite font indices |
| `\"` | 8 | quote |
| `\b` | 2 | backspace (`"★" = "\b"` in `oolite-font.plist`) |
| `\177` | 1 | DEL — `"\177"` deletes the following character during expansion |

The octal escapes are load-bearing, not decorative: `missiontext.plist` uses `"\007 - Corporate State"` and `oolite-font.plist` maps glyphs to `"\030"` / `"\b"`. Implement C-style escapes (`\a \b \f \n \r \t \v \" \' \\ \ooo`), leave any other `\x` as the literal character `x` (do not throw — `gpu-settings.plist` contains regexes like `"GeForce.*\\b5\\d{3}"`, which arrive as `\` + `b` because of the doubled backslash). `[VERIFIED: Resources/Config/missiontext.plist:427,431; oolite-font.plist:34,36; gpu-settings.plist:64]`

#### P2.3 Tokenizer states

Four states suffice: `default` (skip whitespace/comments), `quotedString`, `bareToken`, `punct`. The parser is a recursive descent over `value → dict | array | quotedString | bareToken`, and `bareToken` resolves to bool / integer / real / string by the regexes in §P2.1 **in that order** (`yes` must beat the string fallback, `50` must beat `"50.0"`).

Do not try to be smarter: Oolite's own parser is an `NSScanner`, and the data exploits exactly the leniency above. In particular, **`=` and `{` may be separated by a newline** — the Cobra template is literally:

```
	"oolite_template_cobra3" = 
	{
```
`[VERIFIED: Resources/Config/shipdata.plist:1226-1227]`

A regex-based "key = { on one line" parser silently drops 194 shipdata entries; this is the single easiest way to spend a day debugging nothing.

#### P2.4 Line/column tracking (DATA-01, D-17)

Every AST node carries `{ line, column }` captured at the token that produced it, and every dict entry carries the position of its **key** (for `SCHEMA` errors) plus the position of its `=` (for `PLIST_PARSE`). Errors report 1-based line and column. Verified failure positions to assert in fixtures:

- Unterminated string → line/column of the opening quote.
- `}` where `;` was expected → line/column of the `}`.
- A dict key with no `=` → line/column of the token after the key.

Why not a dependency: the `plist` package parses XML/binary only (STACK.md already rejects it, and it would throw on line 1 of every one of these files). `@plist/openstep.parse` exists but is low-traffic, and we need line/column tracking plus octal escapes plus last-wins duplicates — features a general-purpose tiny library is unlikely to expose. The parser is ~250 lines and is the one component where a bug is invisible in review and catastrophic in output.

#### P2.5 Value provenance (`present` vs `absent` vs `null`)

D-22 requires absent-vs-present preservation, and D-24 requires three states for `market_definition`. Two rules make this reliable:

1. **Never use `undefined` in an emitted record to mean "absent".** Emit either the key (present) or nothing at all, and add an explicit `*Present: boolean` only where a consumer must distinguish against a default. For `market_definition` emit a discriminated union:
   `{ kind: "absent" } | { kind: "system" } | { kind: "explicit", definitions: [...] }`.
2. **Keep the raw AST entry list for provenance-sensitive files** (system, ship) so `extras.oolite` can reproduce what was authored — including the 3 keys the schema does not model (`comment` appears on 3 commodities).

### Pattern 3: `like_ship` resolution — Oolite's actual algorithm

This was read verbatim from `src/Core/OOShipRegistry.m` at `7437f22`. It is materially different from "base → template → variant → overrides".

#### P3.1 Stage order (locked by Oolite, and cheap to match)

```
1. load shipdata.plist            (dict, MERGE_BASIC)
2. entry cleanup: drop non-dictionary entries
3. APPLY shipdata-overrides.plist  ← before like_ship
4. strip private keys (_oo_*)
5. RESOLVE like_ship
6. canonicalise + tag subentities
7. prune unusable entries (templates, missing roles/model)
8. merge shipyard.plist
9. sanitize conditions
```
`[VERIFIED: src/Core/OOShipRegistry.m:250-268 — "Load merges shipdata.plist dictionary. / Apply all like_ship entries. / Load shipdata-overrides.plist and apply patches. ..." and the body order at 276-320]`

**Correction to CONTEXT/PITFALLS:** the overlay order stated as "base entry → `like_ship` template → variant → `shipdata-overrides.plist`" is *wrong in mechanism*, though right in intent ("overrides win"). Overrides are applied to the **raw** entries first (`loadAndApplyShipDataOverrides`), and only then does inheritance merge child-over-parent. For the pinned snapshot the difference is unobservable — the only override entry is unrelated:

```
/*	Fixes for known problems in third-party ship data.
*/

{
	griff_spacebar_subent_template =
	{
		is_template = yes;
	};
}
```
`[VERIFIED: Resources/Config/shipdata-overrides.plist:1-9]`

But D-02's bump can make it observable, and the correct order costs nothing. Also note: overrides **cannot add entries** — `loadAndApplyShipDataOverrides` does nothing when the key is absent from `shipdata.plist`:

> `shipEntry = [ioData objectForKey:shipKey]; if (shipEntry != nil) { ... [shipEntry addEntriesFromDictionary:overridesEntry]; }`
> `[VERIFIED: src/Core/OOShipRegistry.m, -loadAndApplyShipDataOverrides]`

So `griff_spacebar_subent_template` is inert in the pinned snapshot: a fact a test can pin (194 entries in, 194 out).

#### P3.2 The merge (verbatim rules)

```objc
NSMutableDictionary* result = [[parent mutableCopy] autorelease];
[result addEntriesFromDictionary:child];
[result removeObjectForKey:@"like_ship"];

// Certain properties cannot be inherited.
if ([child oo_stringForKey:@"display_name"] == nil) [result removeObjectForKey:@"display_name"];
if ([child oo_stringForKey:@"is_template"]  == nil) [result removeObjectForKey:@"is_template"];
```
plus alias-conflict resolution for five key pairs — `scan_class`/`scanClass`, `escort_role`/`escort-role`, `escort_ship`/`escort-ship`, `is_carrier`/`isCarrier`, `has_shipyard`/`hasShipyard` — where the child's spelling wins and the other is deleted.
`[VERIFIED: src/Core/OOShipRegistry.m, -mergeShip:withParent:]`

So, precisely:

| Rule | Behaviour |
|------|-----------|
| Merge depth | **Shallow.** `materials` and `subentities` are replaced wholesale, never merged key-by-key. |
| `like_ship` | Always stripped from the result. |
| `display_name` | Inherited **only if the child declares it**. |
| `is_template` | Inherited **only if the child declares it** — this is what stops a variant of a template from itself being a template. |
| Alias pairs | Both spellings collapse to the child's, matching Oolite exactly. |
| Everything else | Child wins; parent supplies only missing keys. |

The `is_template` rule is not cosmetic: with a naive "inherit everything" resolver, 173 of 194 entries look like templates; with the real rule, **81** do. That is a 92-entry error, i.e. the catalogue would lose almost every usable ship. `[VERIFIED: measured on Resources/Config/shipdata.plist: 194 entries, 137 with like_ship, 81 templates, 11 with no roles, 102 usable, max chain depth 3]`

**"The child declares it" means "the key is present with a non-nil string-coercible value", not "the value is a string".** Oolite's guard is `[child oo_stringForKey:@"is_template"] == nil`, and `StringForObject` returns `[object stringValue]` for anything that responds to it — so an integer `1` counts as declared:

```objc
if ([object isKindOfClass:[NSString class]]) return object;
else if ([object respondsToSelector:@selector(stringValue)]) return [object stringValue];
return defaultValue;
```
`[VERIFIED: src/Core/OOCollectionExtractors.m, StringForObject]`

The pinned Cobra template declares `is_template = 1;` (an integer), so a JavaScript port that tested `typeof value === "string"` would drop the flag and reclassify every template as a ship. Use `value !== undefined && value !== null`. `[VERIFIED: Resources/Config/shipdata.plist:1308 — "is_template = 1;"]`

#### P3.3 Cycle and dangling detection

Oolite's fixpoint loop reports both failure modes with one message, sorted, and **drops** every unresolved entry:

> "one or more shipdata.plist entries have `%@` references that cannot be resolved: `%@`"
> `[VERIFIED: src/Core/OOShipRegistry.m, -applyLikeShips:withKey:]`

We should do better, because D-17/D-18 require a chain and a distinguishable code:

1. Build the edge map `key → like_ship target`.
2. DFS with an explicit stack per entry, memoising resolved results.
3. A revisit of an in-stack node ⇒ `ContentError { code: "LIKE_SHIP_CYCLE", file, construct: "<key>", chain: ["cobra3-player", "oolite_template_cobra3-player", ...] }`; print the whole chain, closing the loop (`a → b → c → a`).
4. A missing target ⇒ `code: "LIKE_SHIP_DANGLING"` (an additional code is allowed by the discretion clause) **unless** the entry sets `is_external_dependency`, which Oolite treats as intentional.
5. Depth cap 64 ⇒ same error class as a cycle (defensive; the pinned data maxes at 3).

Determinism note: Oolite iterates an `NSDictionary`, so its resolution *order* is unspecified; ours is insertion order. Because the operation is a join, the **result** is order-independent — assert that with a property test (shuffle entry order, compare canonical output).

#### P3.4 What the catalogue should contain

Measured on the pinned file: 102 usable entries, 57 distinct `.dat` filenames, and only **7 usable entries** reference a model we vendor (`cobra3-player`, `cobra3-trader`, `cobra3-alternate`, `cobra3-pirate`, `oolite-cobra3-strict` → `oolite_cobra3.dat`; `coriolis-station`, `oolite-tutorial-station` → `oolite_coriolis.dat`).

Do **not** copy Oolite's `removeUnusableEntries` prune, which deletes any entry whose `.dat` is missing — that would delete 95 of 102 usable entries, because D-01 deliberately vendors two models. Replace it with a recorded fact:

```ts
interface CatalogEntry {
  key: string;
  isTemplate: boolean;
  roles: string[] | null;
  model: string | null;
  modelVendored: boolean;      // true only for the 5 vendored filenames
  shipDef: ShipDef;            // typed projection (stats, materials, subentities)
  extras: Record<string, PlistJson>;  // every remaining resolved key, verbatim
}
```

Fully inlining all 194 resolved entries produced ≈532 KB of JSON (avg 2.7 KB, largest 5.5 KB). The projection with `extras` keeps the same information at a fraction of the size and gives Phase 5/3 a stable typed surface. `[VERIFIED: measured by resolving all 194 entries of shipdata.plist with the real merge rules]`

The legitimate **drift allowlist** for shipdata keys is Oolite's own schema file, not a hand-written list: `Resources/Schemata/shipdataEntrySchema.plist` declares **153** shipdata keys. Warn (don't fail) on a resolved key outside that set — a bump that adds a key is interesting, a bump that adds a typo is the thing we want to see. Note the schema is descriptive, not enforced: it types `has_escape_pod` as `positiveInteger` while the Coriolis ships `has_escape_pod = no`, so values must still be coerced leniently. `[VERIFIED: Resources/Schemata/shipdataEntrySchema.plist — 153 keys; Resources/Config/shipdata.plist:1699 (has_escape_pod = no)]`

#### P3.5 Coercion rules that must match Oolite

These are the exact predicates Oolite uses, and getting any of them wrong changes which ships/stations are templates, dockable, or rotating:

```objc
// OOBooleanFromObject + BooleanFromString
"yes"|"true"|"on"  (case-insensitive)            -> true
"no" |"false"|"off"| zero-string                 -> false
else  doubleValue != 0.0                         -> true
else                                             -> defaultValue
numbers: boolValue / intValue != 0
```
`[VERIFIED: src/Core/OOCollectionExtractors.m:1124-1147, BooleanFromString]`

Consequence: `smooth` appears in the corpus as `yes`, `"yes"`, `1`, `0`, `no`, `"no"` — all six must coerce to the same two values. `[VERIFIED: Resources/Config/shipdata.plist:4637,4727,4796,4904,4950 plus 20 more]`

Vector coercion (used for `station_vector`, `position`, `orientation`, `exhaust`):

```objc
NSString*              -> parse 3 (or 4) space-separated floats
NSArray* count == 3    -> [0],[1],[2]
NSDictionary* with any of x|y|z -> each component, missing = 0
```
`[VERIFIED: src/Core/OOCollectionExtractors.m:1236-1270, OOVectorFromObject]`

Colour coercion (materials): string or array of 3–4 floats, or dict `{red,green,blue[,alpha]}`; **any component > 1.0 switches the whole colour to /255 scaling**:

```objc
if (1.0f < rgbaValue[i]) factor = 1.0f / 255.0f;
```
`[VERIFIED: src/Core/OOColor.m:210-231, +colorFromString]`

This is exactly what the Coriolis comment describes for `emission_modulate_color = {red=6750.9520; green=6780.9630; blue=3280.8824;}`:

> "rgb tripllets with components higher than 1.0 are assumed to be colors expressed as integers rather than normalized floats … our values are divided by 255.0 internally"
> `[VERIFIED: Resources/Config/shipdata.plist:1723-1727]`

So the Coriolis emissive modulate colour is ≈`(26.47, 26.59, 12.87)` — a deliberate over-bright bloom value. Clamp it for glTF and keep the raw value in `extras.oolite` (D-08).

### Pattern 4: `.dat` mesh parser (DATA-03, D-09)

#### P4.1 Verified grammar and per-file statistics

Sections appear in this order and none may shift the scanner if absent: `NVERTS <n>`, `NFACES <m>`, `VERTEX`, `FACES`, `TEXTURES`, `NAMES <k>`, `NORMALS`, `TANGENTS`, `END`.

| File | NVERTS | NFACES | TEXTURES | NAMES | NORMALS | bbox (X × Y × Z) | separators |
|------|--------|--------|----------|-------|---------|------------------|-----------|
| `oolite_cobra3.dat` | 1548 | 1076 | yes (materials `0`,`1`) | `Gun`, `Hull` | **yes** (1548 lines) | `130.0 × 34.9649 × 81.3726` | whitespace + TAB |
| `oolite_coriolis.dat` | 48 | 50 | yes (`oolite_coriolis_diffuse.png`) | — | — | `1000.0 × 1000.0 × 995.918` | **commas** |
| `oolite_coriolis_faceplate.dat` | 1140 | 1820 | yes | — | — | `1000.0 × 1000.0 × 41.369` | **commas** |
| `oolite_coriolis_tris.dat` | 42 | 26 | yes | — | — | `1000.0 × 1000.0 × 995.918` | **commas** |
| `oolite_coriolis_dock.dat` | 244 | 330 | yes | — | — | `103.4123 × 241.888 × 250.0` | **commas** |

`[VERIFIED: all five files fetched from raw.githubusercontent.com/OoliteProject/oolite/7437f22/Resources/Models/ and parsed this session]`

Three facts the plan must absorb:

1. **Commas are separators.** The Coriolis files read `500.00000, -492.92900, 0.00000` and `1,0,0,\t0.88810,-0.32502,0.32502,\t3,\t0,6,1`. The Cobra reads `0 0 0\t0 0 0\t3\t0 1 2`. The tokenizer must split on `[,\s]+`, i.e. treat `,` exactly like whitespace. `[VERIFIED: oolite_coriolis.dat:14,64; oolite_cobra3.dat:1564]`
2. **All 2,226 faces across all five files are triangles.** The `> 3 ⇒ truncate to first three` rule (DATA-03) is therefore *unexercised by real data* — it needs a hand-written fixture, and the parser must warn-not-fail exactly as Oolite does (`n_v < 3` is a hard error; `n_v > 3` warns and uses the first three). `[VERIFIED: src/Core/OOMesh.m:1266-1276]`
3. **The Cobra's per-face normals are all zero.** All 1,076 `FACES` lines carry `0 0 0`; the real normals are the 1,548-line `NORMALS` block, and Oolite switches to `kNormalModeExplicit` when it sees that block — which happens *after* the `smooth` flag is applied, so `smooth = 0` is irrelevant for the Cobra. `[VERIFIED: oolite_cobra3.dat:1564; src/Core/OOMesh.m:1394-1420]`

#### P4.2 Normals: the three modes, exactly

From `setUpVertexArrays` (`OOMesh.m:1707-1790`):

```
if explicit or smooth (per-vertex modes):
    if vertex is an "edge" vertex (touched by faces with different smoothGroup):
        normal = area-weighted mean over faces with the SAME smoothGroup containing that vertex
    else:
        normal = _normals[vertexIndex]        // explicit block, or smooth average over all faces
else (per-face mode):
    normal = _faces[i].normal                  // the FACES-line normal, normalised
```

and the smooth average is `Σ(face.normal × triangleArea)` over every face containing the vertex, then normalised, with fallback `+Z`. `[VERIFIED: src/Core/OOMesh.m:1580-1610, calculateVertexNormalsAndTangentsWithFaceRefs:]`

**Refinement to D-09 (flag for the planner).** The decision text says "per-face normals by default; smoothGroup averaging only when `smooth = yes`". That is correct for the Coriolis parts (all four declare `smooth = 0`, none has a `NORMALS` block ⇒ per-face) but **wrong for the Cobra**, which is `explicit` mode. Measured on `oolite_cobra3.dat`: 595 distinct normals across 1548 vertices, and only **493 of 1076 faces** have three identical corner normals — so ~54% of the Cobra's faces are smoothly shaded by the data. Forcing per-face normals on the Cobra would make it *more* faceted than Oolite and would not match the reference silhouette.

Recommended (and what success criterion 3 actually requires — "per-face normals" describes the default path, not the Cobra):

| Source condition | Mode | Normals emitted |
|------------------|------|-----------------|
| `NORMALS` block present | `explicit` | per-vertex block, with the edge-vertex override |
| `smooth` truthy, no `NORMALS` | `smooth` | area-weighted average, smoothGroup-partitioned at edges |
| otherwise (default) | `per-face` | face normal; if the face normal is `0 0 0`, use `-normalize(cross(v1−v0, v2−v0))` — see §P4.3 |

This is a one-line condition in the converter and a documented refinement of D-09's wording, not a contradiction of its intent ("preserve full source semantics"). Recorded as a resolved open question below.

#### P4.3 Winding normalisation before conversion (the step everyone forgets)

For **non-explicit** modes, Oolite repairs winding against the stored normal:

```objc
calculatedNormal = normal_to_surface(v2, v1, v0);   // == -normalize(cross(v1-v0, v2-v0))
if (norm == kZeroVector) { norm = -calculatedNormal; _faces[i].normal = norm; }
if (norm.x*calc.x < 0 || norm.y*calc.y < 0 || norm.z*calc.z < 0) { swap vertex[0], vertex[2]; swap s[0], s[2]; swap t[0], t[2]; }
```
`[VERIFIED: src/Core/OOMesh.m:1488-1526; src/Core/OOVector.h:309-315]`

Two details matter:

- The test is **per-component sign disagreement**, not a dot product (there is a `FIXME` in the source acknowledging this). On the four Coriolis meshes (the only files the repair runs on — the Cobra is explicit mode) the two tests agree on every face, so the distinction is unobservable here — but implement the per-component test so a future model behaves identically.
- It **swaps the UVs with the vertices**. The converter must do the same or the texture mirrors on the repaired faces.

Measured outcome on the pinned data: for all 2,226 Coriolis faces the stored normal is the **exact opposite** of `normalize(cross(v1−v0, v2−v0))` and equal to `normal_to_surface(v2,v1,v0)`; Oolite therefore flips nothing. The Cobra is explicit mode, so the repair never runs. `[VERIFIED: computed over oolite_coriolis{,_dock,_faceplate,_tris}.dat — 0/50, 0/330, 0/1820, 0/26 agree with the standard normal; 100% agree with Oolite's]`

#### P4.4 UVs

`_[faces].s[i] = s / max_x; _[faces].t[i] = t / max_y;` — nothing else. `[VERIFIED: src/Core/OOMesh.m:1344-1357]`

- The declared `max_x max_y` is **not** the PNG's pixel size. All five vendored models declare `1.0 1.0`, so their UVs are already normalised even though the textures are 512², 512×1024, 1024². Do not "helpfully" divide by image dimensions.
- UVs are **per face-corner**, not per vertex: 1,674 distinct `(vertexIndex, u, v)` triples over 1,548 Cobra vertices (126 seam duplicates). The writer must key vertices on `(vertexIndex, u, v)`.
- V orientation: Oolite uploads the PNG unflipped, so `t = 0` is the image's first row = its top row. glTF defines `v = 0` as the top of the image, and `three@0.187.0`'s `GLTFLoader` sets `texture.flipY = false` for exactly that reason (`GLTFLoader.js:3366`). Therefore the expected answer is **identity, no V flip** — but D-09 requires the asymmetric fixture to decide it, so the fixture is the acceptance test, not this paragraph. `[VERIFIED: three@0.187.0 examples/jsm/loaders/GLTFLoader.js:3366; src/Core/OOMesh.m:1344-1357]`

### Pattern 5: GLB writer

#### P5.1 Mirror Oolite's own vertex layout

`setUpVertexArrays` iterates **materials first, faces second, corners third**, and emits one vertex per corner with no dedup (`FIXME: avoid redundant vertices`) — i.e. the index buffer is `0,1,2,3,…`. The same loop gives us a byte-for-byte deterministic vertex order for free: `[VERIFIED: src/Core/OOMesh.m:1714-1785]`

```
for each material in first-appearance order of TEXTURES:
  for each face in file order whose materialIndex == material:
    for corner in 0,1,2:
      vertex = position[face.vertex[corner]]  (Z negated)
      normal = resolved normal for (face, corner)  (Z negated)
      uv     = (face.s[corner], face.t[corner])
```

Benefits: primitive order matches Oolite's draw order; a glTF `primitive` per material maps 1:1 to Oolite's `triangle_range[mi]`; and the layout is trivially stable across runs. Cost: 3× vertices (Cobra 3,228 instead of 1,674). At ~40 KB of buffer data per ship, that is not worth optimising and dedup would introduce a second ordering rule to defend.

Expected emitted sizes: Cobra 1,076 faces → 3,228 verts → 3,228×(12+12+8) B ≈ 103 KB of buffer. Coriolis composite: 50+1,820+26+330 = 2,226 faces → 6,678 verts ≈ 214 KB. Both well inside budget.

#### P5.2 Coordinate conversion (provable, not conventional)

Oolite is +Z-forward, Y-up. Three/glTF are −Z-forward, Y-up. Apply:

```
position' = (x, y, -z)
normal'   = (x, y, -z)          // M is diagonal ±1 ⇒ M^-T = M
winding   = reverse (swap corner 1 and corner 2)
```

Why reversing is *required*, not stylistic: with `M = diag(1,1,-1)`, `det(M) = -1`, and for a reflection `cross(Ma, Mb) = det(M)·M^-T·cross(a,b) = -M·cross(a,b)`. Since the source index order already yields `cross(v1−v0, v2−v0) = -n` (§P4.3), reversing the corners yields `+M·n = n'`, which is precisely glTF's CCW front face. **One operation satisfies both requirements.**

Consequences to assert:
- `oolite_coriolis_dock.dat` spans local `z ∈ [-250, 0]`; placed by its subentity at station `z = +500.2561`, its mouth is at `z = 500.2561` and its tunnel reaches back to `250.2561`. After conversion the subentity local transform becomes `(0, 0, -500.2561)` and the mouth is at world `-500.2561`. `[VERIFIED: oolite_coriolis_dock.dat bbox; Resources/Config/shipdata.plist:1760 — "position = (0, 0, 500.2561);"]`
- Hull `max z = 495.918`, faceplate spans `z ∈ [492.929, 534.298]` and stands slightly proud of the hull. After conversion those become negative; keep the subentity transforms and do not "tidy" them.
- Do **not** run Oolite's `checkNormalsAndAdjustWinding` *in addition to* the conversion. For these models it is a no-op, but on repaired models it would double-flip. Order: read → (Oolite winding repair if per-face mode) → convert axes + reverse → write.

#### P5.3 Materials

Per material key (from `NAMES` if present, else the TEXTURES filename):

```ts
interface MaterialDef {
  name: string;                       // "Hull" | "Gun" | "oolite_coriolis_diffuse.png"
  baseColorTexture: string | null;    // diffuse_map
  normalTexture: string | null;       // normal_map
  specularTexture: string | null;     // specular_map  (linear colour space)
  emissiveTexture: string | null;     // baked greyscale PNG from emission_map.extract_channel
  metalness: 0;                       // D-08, fixed
  roughness: number;                  // 1 - gloss, clamped to [0.04, 1]
  extrasOolite: { gloss, shininess, specular_color, emission_modulate_color, emission_map }
}
```

- `roughness = clamp(1 - gloss, 0.04, 1)` is the documented, monotone mapping; Cobra Hull `gloss = 0.8` ⇒ `0.2`, Coriolis `gloss = 1.0` ⇒ `0.04`.
- Emissive: `emission_map = { name = X; extract_channel = "a"; }` means "use X's alpha as the emission mask". Verified on `oolite_coriolis_diffuse.png` (512×512 RGBA): 255,920 of 262,144 alpha pixels are 0 and only 6,224 are non-zero — a near-binary mask. Assigning the RGBA diffuse as `emissiveMap` in Three would make the whole hull glow, which is the documented pitfall; the bake is the fix. `[VERIFIED: decoded oolite_coriolis_diffuse.png IDAT this session]`
- Do not emit `transparent: true` for the Coriolis: its alpha is a light mask, not opacity.
- Textures are **separate files**, not embedded in the GLB (D-20 copies the PNGs verbatim). That keeps GLBs small and the "copy verbatim" contract literal.

#### P5.4 `extras.oolite`

Put it on the glTF `material` (and mirror the source path on the node):

```json
{
  "oolite": {
    "sourceFile": "third_party/oolite/Config/shipdata.plist",
    "shipKey": "oolite_template_coriolis-station",
    "materialKey": "oolite_coriolis_diffuse.png",
    "gloss": 1.0, "shininess": 42,
    "specular_color": [0.25, 0.25, 0.25],
    "emission_modulate_color": [26.474, 26.592, 12.866],
    "emission_extract_channel": "a",
    "diffuse_map": "oolite_coriolis_diffuse.png",
    "normal_map": "oolite_coriolis_normal.png",
    "specular_map": "oolite_coriolis_specular.png"
  }
}
```
Three's `GLTFLoader` copies `extras` into `object.userData`, so Phase 3/4 can refine the material later without touching the pipeline (D-08's reversibility claim).

#### P5.5 Writer choice — in-repo, with `@gltf-transform` as the reader

Recommended: a ~150-line writer that builds `{ asset, scenes, nodes, meshes, materials, accessors, bufferViews, buffers }` and concatenates
`header(12) | JSON chunk (4-byte aligned, 0x20 padded) | BIN chunk (4-byte aligned, 0x00 padded)`.

Why:
- `asset.generator` becomes **ours** and changes only when we decide. `NodeIO.writeBinary` hardcodes ``generator: `glTF-Transform ${VERSION}` `` — verified in the shipped dist — so every upgrade of that package would re-baseline every committed GLB, which is exactly the drift noise D-05/D-06 exist to eliminate. `[VERIFIED: @gltf-transform/core@4.5.1 dist/index.js]`
- Buffer ordering, accessor min/max, and JSON key order are all under our control, so the byte layout is a reviewed artefact rather than a dependency's implementation detail.
- Validation does not require us to be the producer: in tests, `new NodeIO().readBinary(bytes)` must round-trip, and the resulting `Document` is asserted for primitive count, material count, accessor min/max and `extras`. That is a genuinely independent check — a reader written by someone else accepting our bytes.

Determinism rules for the writer: no `Date`, no `Math.random`, no `os.arch`, fixed JSON key order (insertion order, never sorted-then-unsorted), `min`/`max` computed from the same doubles that were written, and `bytesPerComponent`-width padding to 4 bytes before every bufferView.

### Pattern 6: Determinism and the drift gate

#### P6.1 Canonical JSON

| Rule | Why |
|------|-----|
| Sorted keys, **code-unit order** (`a < b ? -1 : 1`), never `localeCompare` | `JSON.stringify` preserves insertion order — which differs between a `Map` built in file order and one built in TEMP order — and `localeCompare` is ICU-dependent. |
| Numbers via `String(n)` (ECMAScript `Number::toString`) | Fully specified shortest round-trip; identical on every engine and architecture. Do not use `toFixed` (tie-breaking has historically varied) and normalise `-0` to `0`. |
| Integers emitted as integers; reals emitted as their shortest round-trip text | `452760.000000` becomes `452760`; `84449.095459` stays `84449.095459`. **Value-preserving normalisation, not byte-preserving** — document that trailing zeros are lost. |
| 2-space indent, `\n` line terminator, final newline | Human-reviewable diffs; matches Prettier's structural output closely enough to be stable. |
| No timestamps, no generator version, no host paths | D-05. Manifest carries the Oolite commit instead. |
| UTF-8 output with literal non-ASCII | The corpus contains `☆`, `★`, `–`, NBSP; escaping them would double the bytes and make diffs unreadable. |
| Explicit key order for objects with integer-like keys | JS reorders `"0"`, `"7"` numerically regardless of insertion; emit arrays of records instead of objects keyed by number. |

**Critical integration constraint:** `lint` is `eslint . && prettier --check .`, and Prettier *does* format JSON. Prettier puts short arrays inline (`["a", "b"]`) where `JSON.stringify(x, null, 2)` puts one element per line, so canonical output and Prettier output **will** diverge. `src/content/generated/` must be added to `.prettierignore` (and the same folder listed in ESLint `ignores` if any `.ts` is emitted there). `[VERIFIED: package.json:14; .prettierignore:1-10]`

#### P6.2 Manifest

One file, `src/content/generated/manifest.json`:

```json
{
  "format": "wegolite-content-manifest",
  "schemaVersion": 1,
  "oolite": { "release": "1.93.1-241", "commit": "7437f22", "retrieved": "2026-11-03" },
  "generator": "oolite-ingest/1",
  "files": [
    { "path": "commodities.json", "bytes": 4213, "sha256": "…" },
    { "path": "systems/g0.json", "bytes": 253914, "sha256": "…" }
  ]
}
```

- Sorted by `path` (code-unit order) so the manifest itself is canonical.
- `files` covers **every** emitted artefact: JSON, GLB, copied PNG, baked PNG. That is what makes `assets:check` a single comparison.
- `schemaVersion` lets D-15's runtime check refuse a mismatched app/manifest pair loudly.
- `oolite.retrieved` is a *date we assert*, not `new Date()` — D-05 forbids timestamps, and a bump should require a human to write the date down.

#### P6.3 `assets:build` / `assets:check`

```
assets:build  = tsx tools/oolite-ingest/cli.ts            # writes src/content/generated + public/**
assets:check  = tsx tools/oolite-ingest/cli.ts --check     # regenerates into os.tmpdir()/<random>, compares, exits 1
```

`--check` must: (1) regenerate the full output set into a temp dir, (2) compare the **file-set** (missing and extra both fail), (3) compare bytes, (4) compare each entry's SHA-256 against the committed manifest, (5) print a per-file report (`MISSING`, `EXTRA`, `CHANGED bytes`, `CHANGED hash`) and exit non-zero. Do not shell out to `git diff` — the tree may be dirty for legitimate reasons, and `git diff --exit-code` silently passes on untracked files.

Temp-dir cleanup must be `try/finally`; a failed check must not leave a directory behind in the container.

#### P6.4 What is genuinely architecture-dependent

| Source of divergence | Real risk | Rule |
|----------------------|-----------|------|
| `Math.sin/cos/tan/exp/log/pow` | Spec-permitted 1-ULP differences | **Ban them in the generator.** Everything needed is `+ - * /`, `Math.sqrt` (IEEE-correctly-rounded), `Math.min/max`, and integer ops. Add an ESLint `no-restricted-properties` block for `tools/oolite-ingest/**` mirroring the sim zone's `Math.random` rule. |
| `localeCompare`, `Intl.*` | ICU version dependent | Ban; sort with code-unit comparison. |
| `toFixed`/`toPrecision` | Tie-breaking history | Ban; use `String(n)`. |
| Directory iteration order (`readdir`) | Unspecified | Always `.sort()` the names before generating or hashing. |
| Object key order | Spec'd but integer-like keys reorder | Sort explicitly; emit arrays where the key would be numeric. |
| zlib (PNG encode) | **Integer-only algorithm** ⇒ identical for an identical build; the container pins the Node/zlib build by image digest | Pin the Node image (already done) **and** pass explicit `{ level: 9, strategy: Z_FIXED, memLevel: 9, windowBits: 15, chunkSize: 65536 }`, prefix every scanline with filter type `0`, and prove equality with the arm64/amd64 probe. |
| SHA-256 (`node:crypto`) | Integer-only | Safe. |
| Float32 conversion of mesh data | `Math.fround` and `Float32Array` are IEEE-exact | Safe. |

**The one open empirical question** is the PNG. The recommendation is to run the probe *first* (plan the arm64/amd64 job before the texture baker lands) and only if it disagrees, fall back to a hand-written **stored-block deflate** (PNG filter 0 + uncompressed deflate blocks). That fallback costs ~1 MB per 1024² greyscale map and zero determinism risk, so it is a real option, not a threat. `[ASSUMED: that identical zlib builds produce identical bytes — the algorithm is integer-only, but this is an argument, not a measurement; the probe is the falsification step]`

#### P6.5 Verify-chain wiring (exact strings)

`compose.yaml:74-78` currently reads:

```
npm run lint &&
npm run typecheck &&
npm run test &&
npm run build &&
npm run test:e2e
```

and `tests/contract/container-contract.test.ts:281-283` asserts that string **byte-for-byte**:

```ts
expect(verify.slice(chainAt)).toBe(
  "npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e",
);
```

So inserting `assets:check` requires editing three places in one commit: `compose.yaml`, that assertion, and (if a Compose service is added) `AGENTS.md` + `README.md`, because `tests/contract/container-contract.test.ts:390-397` requires exact set equality between documented `docker compose run --rm` targets and declared services. Also pinned and therefore immutable: `"test": "vitest run"`, `"lint": "eslint . && prettier --check ."`, `"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit"`, `"test:e2e": "playwright test"` (`container-contract.test.ts:264-269`; values quoted from `package.json:13-16`).

Corollary: **do not add a third tsconfig** (`tsconfig.tools.json`) — it would break the `typecheck` pin. `tools/**/*.ts` is already in the root project's `include`.

#### P6.6 Failure contract

One class, four required codes plus the discretionary extras:

```ts
interface ContentError {
  code: "PLIST_PARSE" | "LIKE_SHIP_CYCLE" | "DAT_MESH" | "SCHEMA"
      | "LIKE_SHIP_DANGLING" | "TEXTURE_MISSING" | "MESH_BOUNDS";
  file: string;        // repo-relative, e.g. "third_party/oolite/Config/shipdata.plist"
  construct: string;   // dict key, ship key, mesh section, or record path
  line?: number;       // 1-based, when the error came from text
  column?: number;
  chain?: string[];    // whole like_ship chain for cycle/dangling
  excerpt: string;     // ≤120 chars, single line, whitespace-collapsed
}
```

- Fail fast on the first structural error (D-18); the CLI prints `code file:line:column construct` plus the excerpt and exits 1.
- `SCHEMA` errors (zod) get `construct` = dotted record path (`systems/g0.json:g0-s7.planetRadius`) and no line/column — the fixture asserts that shape.
- Tests assert `code`, `file`, `construct` always, and line/column where applicable (D-19).

### Anti-Patterns to Avoid

- **Regex "key = value" parsing.** It fails on the 194-entry block whose `{` is on the next line, and on every comment.
- **Deep-merging `like_ship`.** Oolite replaces `materials` and `subentities` wholesale. A deep merge would blend a variant's `materials` into its template's and produce a hull with the wrong texture set.
- **Inheriting `is_template` by default.** 173 of 194 entries would be classified as templates instead of 81.
- **Treating `.dat` commas as part of a number.** `parseFloat("500.00000,")` works by luck; `parseInt`/`Number` on `"3,"` yields `NaN`. Split on `[,\s]+` once.
- **Trusting the Cobra's `FACES` normals.** They are `0 0 0`; use the `NORMALS` block.
- **Calling `computeVertexNormals()`.** It destroys the authored normals on both ships and is the single fastest way to fail the "identical to Oolite" acceptance criterion.
- **Re-running Oolite's winding repair after the axis conversion.** It would double-flip.
- **Emitting generated JSON as `.js`/`.ts` modules.** Vite would parse them; canonical bytes would go through a bundler transform and `assets:check` would compare the wrong thing.
- **Letting `assets:check` depend on `git`.** Untracked files pass `git diff --exit-code`.
- **`JSON.stringify(obj)` with a `Map`.** Silent `{}`.

### Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| glTF structure validation | A second GLB parser | `@gltf-transform/core` `NodeIO.readBinary` in tests | Independent reader; catches accessor/alignment errors our writer could share a bug with. |
| Property-testing | Hand-rolled random generators | `fast-check` (`fc.assert(fc.property(...))`) | Shrinking is the whole value; a failing 40-node plist AST reduces to a 4-node one automatically. |
| PNG decoding | A full image library | ~40 lines: parse `IHDR`, `zlib.inflateSync(IDAT)`, unfilter rows | We only need alpha from non-interlaced 8-bit RGBA, verified true of all four sampled textures. `pngjs`/`sharp` are a dependency and a native build for one channel. |
| JSON hashing | A new hash dependency | `node:crypto` `createHash('sha256')` in tools | D-05; the sim keeps FNV-1a (already written). |
| Service-set / chain assertions | New test infrastructure | Extend `tests/contract/container-contract.test.ts` in place | It already parses Compose and pins the exact strings; a second suite would drift. |
| Snapshot download | A runtime fetch | A shell script run once by a human, output committed | D-02; a build must never touch the network. |

---

## The Pinned Data, Measured

Everything in this section was extracted from the pinned tree this session and is the fixture material for the phase. Treat these as the golden values the tests assert.

### Systems (`planetinfo.plist`)

- **2,050 top-level keys** = 2,048 systems + `"universal"` + `"interstellar space"`. Exactly 256 per galaxy for galaxies `0`–`7`. The generator must skip the two non-system keys explicitly (a `"0 0"`-style regex already does this, but an explicit skip is clearer and fails loudly if a bump adds a third).
- **40 keys appear on every one of the 2,048 systems**: `air_color`, `air_color_mix_ratio`, `air_density`, `ambient_level`, `cloud_alpha`, `cloud_color`, `cloud_fraction`, `coordinates`, `corona_flare`, `corona_hues`, `corona_shimmer`, `description`, `economy`, `government`, `inhabitant`, `inhabitants`, `land_color`, `land_fraction`, `layer`, `name`, `planet_distance`, `polar_cloud_color`, `polar_land_color`, `polar_sea_color`, `population`, `productivity`, `radius`, `random_seed`, `rotation_speed`, `sea_color`, `sky_n_blurs`, `sky_n_stars`, `station`, `station_vector`, `sun_color`, `sun_distance`, `sun_radius`, `sun_vector`, `techlevel`, `terminator_threshold_vector`.
- **`percent_cloud` appears on exactly one system: Lave.** This is the perfect present-vs-absent fixture for D-22 — assert Lave has it and, say, `g0-s8` does not.
- `coordinates` is a **space-separated string**, `station_vector`/`sun_vector`/`sun_color` are strings, colours carry 4 components, `random_seed` is a 6-component string.

**Lave, verbatim** (`Resources/Config/planetinfo.plist:321-363`, key `"0 7"`):

```
	"0 7" = {
		air_color = "0.0 0.0 1.0 1";
		cloud_alpha = 0.75;
		cloud_fraction = 0.260000;
		coordinates = "20 173";
		description = "Lave is most famous for its vast rain forests and the Laveian tree grub.";
		economy = 5;
		government = 3;
		inhabitant = "Human Colonial";
		inhabitants = "Human Colonials";
		name = "Lave";
		percent_cloud = 85;
		planet_distance = 452760.000000;
		population = 25;
		productivity = 7000;
		radius = 4116;
		random_seed = "56 173 156 20 29 21";
		rotation_speed = 0.004504;
		sky_n_blurs = 129;
		sky_n_stars = 8887;
		station = "coriolis";
		station_vector = "0.601 -0.738 0.305";
		sun_color = "1 1 1 1";
		sun_distance = 905520;
		sun_radius = 84449.095459;
		sun_vector = "0.865 0.376 -0.334";
		techlevel = 4;
	};
```

Fixture assertions for `g0-s7`: `name = "Lave"`, `chartX = 20`, `chartY = 173`, `economy = 5`, `government = 3`, `techLevelRaw = 4` (displayed 5), `population = 25` (displayed 2.5 billion), `productivity = 7000`, `radiusKm = 4116` (→ 41,160 game units), `planetDistance = 452760`, `sunDistance = 905520`, `sunRadius = 84449.095459`, `station = "coriolis"`, `stationVector = [0.601, -0.738, 0.305]`, `sunVector = [0.865, 0.376, -0.334]`, `percentCloud = 85` present.

Note `station = "coriolis"` is a **role** fragment, not a ship key: the actual shipdata entry is `coriolis-station`, whose `roles = "coriolis station"`. Preserve the raw value; resolution is a runtime concern (Phase 3).

Estimated chunk size: source blocks average ~1,307 characters, so a galaxy is ~250 KB of canonical JSON (~2 MB across eight). Eager-loading `g0` is ~60 KB gzipped — well within D-14's assumption.

### Commodities (`trade-goods.plist`)

17 entries, all integer `price_average` in decicredits, `quantity_unit` ∈ {0,1,2}:

| Key | `quantity_unit` | Unit | `price_average` (dc) | `price_economic` | `price_random` | `sort_order` | `legality_export` |
|-----|-----------------|------|----------------------|------------------|----------------|--------------|-------------------|
| `food` | 0 | t | 50 | 0.55 | 0.04 | 100 | 0 |
| `textiles` | 0 | t | 71 | 0.18 | 0.09 | 200 | 0 |
| `radioactives` | 0 | t | 231 | … | … | 300 | 0 |
| `slaves` | 0 | t | 152 | | | 400 | 1 |
| `liquor_wines` | 0 | t | 291 | | | 500 | 0 |
| `luxuries` | 0 | t | 902 | | | 600 | 0 |
| `narcotics` | 0 | t | 512 | | | 700 | 2 |
| `computers` | 0 | t | 818 | | | 800 | 0 |
| `machinery` | 0 | t | 560 | | | 900 | 0 |
| `alloys` | 0 | t | 388 | | | 1000 | 0 |
| `firearms` | 0 | t | 692 | | | 1100 | 1 |
| `furs` | 0 | t | 704 | | | 1200 | 0 |
| `minerals` | 0 | t | 120 | | | 1300 | 0 |
| `gold` | **1** | **kg** | 388 | | | 1400 | 0 |
| `platinum` | **1** | **kg** | 718 | | | 1500 | 0 |
| `gem_stones` | **2** | **g** | 196 | | | 1600 | 0 |
| `alien_items` | 0 | t | 436 | | | 1700 | 0 |

`[VERIFIED: Resources/Config/trade-goods.plist (17 entries parsed this session); first entry quoted at :5-25 — "food" = { "name" = "[commodity-name food]"; ... "quantity_unit" = 0;  // 0=t ... "price_average" = 50; // decicredits ... "sort_order" = 100; }]`

Every entry has exactly these keys: `name`, `classes`, `quantity_unit`, `peak_export`, `peak_import`, `price_average`, `price_economic`, `price_random`, `quantity_average`, `quantity_economic`, `quantity_random`, `legality_export`, `legality_import`, `trumble_opinion`, `sort_order` — plus an optional `comment` on 3 of them. `name` is a **localisation token** (`"[commodity-name food]"`), not a display string; keep it and let Phase 5 resolve it.

`alien_items` keeps `quantity_average = 0` (all three quantity fields zero), so a correct Phase 5 market shows it with no stock; the typed record must still carry it with `tradeable: false` (D-13).

### Equipment (`equipment.plist`)

**41 entries**, every one a **6-element positional array** `(techLevel, price, name, key, description, conditionsDict)`. Prices are decicredits. All 41 keys:

```
EQ_FUEL 0/2 · EQ_MISSILE 1/300 · EQ_CARGO_BAY 1/4000 · EQ_ECM 2/6000 ·
EQ_FUEL_SCOOPS 5/5250 · EQ_ESCAPE_POD 6/10000 · EQ_ENERGY_UNIT 8/15000 ·
EQ_NAVAL_ENERGY_UNIT 13/500000 · EQ_DOCK_COMP 9/15000 · EQ_GAL_DRIVE 10/50000 ·
EQ_WEAPON_NONE 3/0 · EQ_WEAPON_PULSE_LASER 3/4000 · EQ_WEAPON_BEAM_LASER 4/10000 ·
EQ_WEAPON_MINING_LASER 10/8000 · EQ_WEAPON_MILITARY_LASER 10/60000 ·
EQ_CLOAKING_DEVICE 15/500000 · thargon 100/1000 · EQ_THARGON 100/1000 ·
EQ_TRUMBLE 100/300 · EQ_PASSENGER_BERTH 5/8250 · EQ_PASSENGER_BERTH_REMOVAL 1/1000 ·
EQ_MISSILE_REMOVAL 1/200 · EQ_HARDENED_MISSILE 9/3500 · EQ_FUEL_INJECTION 10/6000 ·
EQ_SCANNER_SHOW_MISSILE_TARGET 11/4500 · EQ_MULTI_TARGET 5/3250 ·
EQ_ADVANCED_COMPASS 7/6500 · EQ_ADVANCED_NAVIGATIONAL_ARRAY 6/22500 ·
EQ_TARGET_MEMORY 8/12500 · EQ_INTEGRATED_TARGETING_SYSTEM 11/15000 ·
EQ_WEAPON_THARGOID_LASER 100/150000 · EQ_QC_MINE 6/25000 ·
EQ_SHIELD_BOOSTER 10/147500 · EQ_NAVAL_SHIELD_BOOSTER 13/475500 ·
EQ_HEAT_SHIELD 4/15000 · EQ_WORMHOLE_SCANNER 9/23950 · EQ_RENOVATION 6/1000 ·
EQ_MILITARY_JAMMER 0/1500000 · EQ_MILITARY_SCANNER_FILTER 0/250000 ·
EQ_SHIELD_ENHANCER 100/147500 · EQ_OOLITE_TUTORIAL_CONTROLS 100/500000
```
(`key TL/price`; `[VERIFIED: Resources/Config/equipment.plist, parsed this session — 41 six-element arrays]`)

Condition keys actually used across the 41 entries: `available_to_all` (22), `condition_script` (36), `requires_non_full_fuel` (1), `purchase_sort_order` (1), `requires_empty_pylon` (3), `damage_probability` (7), `provides` (1), `incompatible_with_equipment` (1), `script_info` (5), `weapon_info` (7), `portable_between_ships` (1), `script` (2), `fast_affinity_defensive` (1), `available_to_player` (4), `visible` (2), `available_to_NPCs` (2), `can_carry_multiple` (1), `requires_cargo_space` (1), `requires_free_passenger_berth` (1), `requires_mounted_pylon` (1), `requires_equipment` (1). `[VERIFIED: same parse]`

Schema implication: the `conditions` object must be an open record with these 21 known optional keys and `z.record(z.string(), z.unknown())` for the rest — a closed `z.object` will break on the next bump. Do **not** evaluate anything (D-10).

Two values are useful sanity anchors for the "decicredits" trap: `EQ_DOCK_COMP` at `15000` = **1,500 Cr** (matches DOCK-05), `EQ_CARGO_BAY` at `4000` = **400 Cr**, `EQ_FUEL` at `2` = **0.2 Cr** per 0.1 LY.

### Labels (`descriptions.plist`)

1,144 top-level keys. The label arrays D-23 needs, and nothing else:

| Key | Shape | Length |
|-----|-------|--------|
| `economy` | array of strings | 8 (`Rich Industrial` … `Poor Agricultural`) |
| `government` | array of strings | 8 (`Anarchy` … `Corporate State`) |
| `legal_status` | array of strings | 3 (`Clean`, `Offender`, `Fugitive`) |
| `rating` | array of strings | 9 (`Harmless` … `☆ Deadly ☆`) |
| `inhabitants` | array of **5 arrays** | adjective/plural component pools |
| `system_description` | array of **36 arrays** | template pools with `[n]`, `%R`, `[%H]` placeholders |

`[VERIFIED: Resources/Config/descriptions.plist, parsed this session]`

**Correction to D-23:** there is **no tech-level label array** in `descriptions.plist` (or anywhere in the pinned snapshot). The tech-level display is a *format template*, `"sysdata-tl-value" = "[techLevel]";`, plus the +1 rule in D-25. Compile the six arrays above; do not invent a TL table.

Everything is a template, not prose: `"[commodity-name food]"`, `%@`, `%R`, `[20]`, `[techLevel]`. Preserve verbatim; expansion is Phase 5/7's job.

### Ships (`shipdata.plist`)

Structure and counts (`[VERIFIED: parsed this session]`): **194 top-level entries**, 137 with `like_ship`, 81 templates, 11 with no roles, 102 usable, 57 distinct `.dat` filenames, max chain depth 3, 79 subentity declarations (all new-style dicts: 13 entity-type, 66 flasher-type), 4 with `is_dock = true`.

The three chains that matter:

```
cobra3-player
  └─oolite_template_cobra3-player   { like_ship = "oolite_template_cobra3"; is_template = 1;
                                      forward_weapon_type = "WEAPON_PULSE_LASER"; roles = "player"; }
      └─oolite_template_cobra3      { max_flight_speed = 350; thrust = 32; max_flight_pitch = 1;
                                      max_flight_roll = 2; max_cargo = 20; fuel = 70;
                                      model = "oolite_cobra3.dat"; materials = { "Hull" …, "Gun" … } }

coriolis-station
  └─oolite_template_coriolis-station { station_roll = "0.08"; market_definition = ( /* empty */ );
                                       market_monitored = yes; rotating = yes;
                                       model = "oolite_coriolis.dat";
                                       subentities = ( faceplate@0, tris@0, dock@(0,0,500.2561) … ) }
```
`[VERIFIED: Resources/Config/shipdata.plist:1437-1443 (player template), :1226-1353 (base template), :1690-1878 (station template), :4379-4382 (cobra3-player), :4402-4405 (coriolis-station)]`

Sub-entries are separate top-level keys with their own models: `oolite_coriolis_faceplate` (`smooth = 0`), `oolite_coriolis_tris` (`smooth = 0`), `oolite_coriolis_dock` (`smooth = 0`, no `roles` — it exists only as a subentity). `[VERIFIED: shipdata.plist:1630-1660 approx., entries for oolite_coriolis_faceplate / _tris / _dock]`

`market_definition` tri-state, directly evidenced (D-24):

| State | Where | Count |
|-------|-------|-------|
| comment-only empty array ⇒ "matches system prices" | `oolite_template_coriolis-station` and two station templates | 3 |
| explicit definitions ⇒ e.g. `"type" = "class"; "name" = "oolite-mining"` | two station templates | 2 |
| key absent ⇒ blank market | every other entry | 189 |

`[VERIFIED: shipdata.plist:1702-1705, 1891-1894, 2348-2351 (empty); :3256-3260, 3372-3376 (explicit)]`

### Textures (16 files, ~18.8 MiB)

| Group | Files |
|-------|-------|
| Cobra | `oolite_cobra3_diffuse.png` (1024², 1.59 MB), `oolite_cobra3_normal.png`, `oolite_cobra3_specular.png`, `oolite_cobra3_subents.png` (256²), `oolite_cobra3_subents_normal.png` |
| Coriolis hull | `oolite_coriolis_diffuse.png` (512², 562 KB), `oolite_coriolis_normal.png`, `oolite_coriolis_specular.png` |
| Faceplate | `oolite_coriolis_faceplate_{diffuse,normal,specular}.png` (2.1–2.5 MB each) |
| Tris | `oolite_coriolis_tris_{diffuse,normal,specular}.png` (0.9–1.1 MB each) |
| Dock | `oolite_coriolis_dock_diffuse.png` (512×1024), `oolite_coriolis_dock_normal.png` (2.8 MB) |

All four sampled textures are 8-bit, non-interlaced, colour-type 6 (RGBA). `[VERIFIED: PNG IHDR parsed this session]`

**Size warning for the plan.** ~18.8 MiB of verbatim PNGs sits just under the 20 MB threshold that `STACK.md` names as the trigger for Meshopt/KTX2 — and D-20 defers compression to Phase 7. This is a *known, accepted* cost, not a blocker, but the plan should (a) state it in the phase notes, (b) not accidentally vendor `cobra3_redux`, `_alt`, or `_pirate` variants, and (c) keep `assets:check` fast — it compares ~19 MiB of bytes per run, which is still sub-second.

---

## Scope, Sequencing & Context Budget

The phase is MVP-mode, so the first plan must be a **tracer**: the thinnest slice that goes snapshot → parser → typed record → committed output → drift gate → green `verify`. Everything after that is width, not depth.

### Plan sequence (dependency-ordered)

| # | Plan | Delivers | Exit criterion | Depends on |
|---|------|----------|----------------|------------|
| 1 | **Tracer**: vendor + parser slice + 17 commodities + canonical JSON + manifest + `assets:check` | `third_party/oolite/**` + `ASSETS.md` rows; tokenizer/parser for dict/array/string/int/real/bool/comment; `commodities.json`; `manifest.json`; `assets:build`/`assets:check`; `assets` service; `verify` chain insertion; contract-test + guide updates; `.prettierignore` | **`docker compose run --rm verify` green; mutating one byte of `commodities.json` fails `assets:check` and names the file** | Phase 1 |
| 2 | Parser completeness + failure contract | All 40 plists parse; octal escapes; duplicates last-wins; empty dict/array preserved; `ContentError` with line/column; malformed-plist and schema fixtures | 40/40 files parse; failure fixtures assert code+file+line+column | 1 |
| 3 | Systems | `systems/g0..g7.json`, stable ids, raw values, present-vs-absent, Lave golden | Lave golden matches every value in §Systems; 8×256 counts asserted | 2 |
| 4 | Equipment + labels + market tri-state | 41 equipment records with preserved conditions; 6 label arrays; `market_definition` tri-state from shipdata | Equipment golden + tri-state counts (3 empty / 2 explicit / 189 absent) | 2 |
| 5 | `like_ship` + shipdata catalogue | Real merge rules, alias pairs, cycle/dangling detection with chain, typed projection + `extras`, 153-key drift allowlist | 194→194, 81 templates, 102 usable, depth 3; cycle fixture prints `a → b → c → a` | 2, 4 |
| 6 | `.dat` parser | All five meshes; commas; `NAMES`/`NORMALS`; three normal modes; winding repair; bbox validation; broken-mesh fixture | §P4.1 counts and bboxes exact; `> 3` truncation fixture | 2 |
| 7 | GLB writer | Per-material primitives; coordinate/winding conversion; `extras.oolite`; deterministic bytes; `NodeIO` reader round-trip; asymmetric UV fixture; dock transform `(0,0,-500.2561)` | Two runs byte-identical; reader round-trips; UV handedness fixture passes | 5, 6 |
| 8 | Textures + emissive bake | 16 PNGs copied verbatim; greyscale emissive from alpha; missing-texture `ContentError` | Copy set == referenced set; bake byte-stable across two runs; missing-texture fixture | 1, 7 |
| 9 | Cross-arch determinism proof | `scripts/check-arch-determinism.sh`; documented exclusion list (expected empty); record the result | arm64 output byte-identical to amd64 (or the exclusion is written down and justified) | 1–8 |
| 10 | Content boundary + close-out | `src/content/types.ts` + schemas; manifest runtime validation; sim-zone ESLint extension for `src/content`; README/`FIDELITY` notes; `ASSETS.md` completeness test | Sim imports types only; manifest mismatch fails loudly; compliance-assets test green | 3–9 |

**Wave structure:** 1 → 2 → {3, 4, 6} → {5, 7} → 8 → 9 → 10. Plans 3, 4 and 6 are mutually independent once the parser is complete; 5 depends on 4 only because the `market_definition` tri-state lives in shipdata. 7 must follow both 5 (materials/transforms) and 6 (geometry).

### Smallest end-to-end slice (the tracer, spelled out)

1. `third_party/oolite/Config/trade-goods.plist` + `SOURCE.md` + `LICENSE-oolite.txt` only (1 of 40 files).
2. Parser with the four tokenizer states and no line/column yet (added in plan 2).
3. Emit `src/content/generated/commodities.json` + `manifest.json`.
4. `assets:check` regenerates into `mkdtemp` and diffs.
5. One Compose service, one chain edit, one contract-test edit, two doc rows.

That is ~600 lines total and it proves the two things that are expensive to discover late: **the parser shape** and **the gate**. Everything else in the phase is a converter plugged into a proven frame.

### Context-budget risks

| Risk | Why it bites | Mitigation |
|------|--------------|------------|
| `shipdata.plist` + `like_ship` + the catalogue is one plan's worth of subtle rules | Five merge rules, five alias pairs, two error classes, 194 entries, a projection schema and a drift allowlist — a single plan that touches all of it will run long and review badly | Split plan 5 into 5a (resolver + merge rules + cycle detection, tested against synthetic fixtures) and 5b (catalogue projection + drift allowlist + goldens) if execution shows it overrunning. |
| GLB writer + geometry conversion is the densest code in the phase | Buffer layout, padding, accessor min/max, three normal modes, winding, UV seams, extras — all in one file | Keep plan 7 to the writer and a *single* mesh (Cobra) first; the Coriolis composite is plan 7b (four meshes + node transforms). |
| ~19 MiB of PNGs in the working tree | Slows `git status`, `docker` context, and any `diff -r` | Land plan 8 after the JSON/GLB work so the tree stays small for as long as possible; add `public/textures` to the arch-diff script's per-file hash comparison rather than byte-diffing ~19 MiB in the log. |
| The phase touches many pinned Phase 1 contracts | Every edit has a test that will fail first and look like a regression | Put *all* the coupling edits (chain, contract assertion, guides, `.prettierignore`, vitest glob) in plan 1's tracer commit, where their failure is expected and explained. |

**Split recommendation:** 10 plans is right for this phase's surface area; if `granularity` forces fewer, merge 4 into 3 (systems+equipment+labels all read the same parser and emit sibling files) and 9 into 10. Do **not** merge 5/6/7 — those three carry all the fidelity risk, and separate plans keep each reviewable.

## Common Pitfalls

### Pitfall 1: The `verify` chain is pinned by a test you will forget to update

**What goes wrong:** `assets:check` is added to `compose.yaml`; `verify` now fails at the test stage with a diff of the chain string, and the failure looks like a contract violation rather than a stale assertion.
**Why:** `tests/contract/container-contract.test.ts:281-283` asserts the exact chain; `:264-269` asserts four script strings; `:390-397` asserts exact service-set equality across `compose.yaml`, `AGENTS.md` and `README.md`.
**Avoid:** one commit that edits `compose.yaml`, the chain assertion, and both guides; add an `assets` service only if you also document it.
**Warning sign:** `verify` fails in `test` with a multi-line string comparison.

### Pitfall 2: `prettier --check .` fights canonical JSON

**What goes wrong:** `assets:build` writes canonical JSON; `lint` then reports formatting diffs in `src/content/generated/*.json`, and the "fix" (`prettier --write`) destroys canonical byte output and breaks `assets:check`.
**Why:** `lint` is `eslint . && prettier --check .`, and Prettier formats JSON.
**Avoid:** add `src/content/generated` (and `third_party`) to `.prettierignore` in the first plan that emits a file.
**Warning sign:** a lint diff whose only change is array wrapping.

### Pitfall 3: Parsing shipdata with a "key = {" one-line assumption

**What goes wrong:** 194 entries collapse to 12, the catalogue is nearly empty, and every `like_ship` looks dangling.
**Why:** every template entry puts `{` on the following line (`shipdata.plist:1226-1227`), and one entry (`oolite_template_buoy`, line 1011) is indented with **spaces** while the rest use tabs.
**Avoid:** tokenise, never regex; whitespace (including newlines) is insignificant between tokens.
**Warning sign:** "targets not defined: oolite_template_buoy" in the resolver output.

### Pitfall 4: Splitting `.dat` fields on whitespace only

**What goes wrong:** `NaN` positions in the Coriolis, or every vertex collapsing to `(500, 0, 0)`.
**Why:** the four Coriolis models use `,` as a separator (`1,0,0,\t0.88810,…`); the Cobra does not.
**Avoid:** split on `/[,\s]+/`; assert `Number.isFinite` on every component.
**Warning sign:** bbox assertion reports `NaN` or a zero-extent axis.

### Pitfall 5: Using the zero `FACES` normals for the Cobra

**What goes wrong:** the Cobra renders completely flat-black (zero-length normals) or computes garbage lighting.
**Why:** all 1,076 Cobra face normals are `0 0 0`; the real data is the 1,548-line `NORMALS` block.
**Avoid:** implement the three normal modes (§P4.2) and select `explicit` when the block exists.
**Warning sign:** a normal-length assertion failing at 0, or "595 distinct normals" not matching.

### Pitfall 6: Inheriting `is_template`

**What goes wrong:** 173 entries are classified as templates instead of 81; almost every ship disappears from the catalogue; the Cobra is pruned.
**Why:** Oolite removes `is_template` during merge unless the *child* declares it (`mergeShip`).
**Avoid:** implement the three non-inheritable rules and five alias pairs exactly.
**Warning sign:** `cobra3-player` reports `isTemplate: true`.

### Pitfall 7: Deep-merging materials or subentities

**What goes wrong:** `cobra3-player` inherits the pirate variant's `materials` because two variants both merge into the same template and the deep merge blends them.
**Why:** Oolite's merge is one `addEntriesFromDictionary:`.
**Avoid:** shallow replace, always.
**Warning sign:** a hull textured with `oolite_cobra3_diffuse_pirate.png`.

### Pitfall 8: Re-running Oolite's winding repair after the axis conversion

**What goes wrong:** the Coriolis renders inside-out (back faces visible), the dock becomes a black hole, and `DoubleSide` "fixes" it and hides the bug.
**Why:** the repair flips winding to agree with the *source* normal; after negating Z you must reverse once more for glTF. Doing both in the wrong order double-flips.
**Avoid:** fixed pipeline order — read → (repair if per-face) → negate Z on positions/normals → reverse corners → write.
**Warning sign:** `THREE.FrontSide` shows the interior.

### Pitfall 9: Dividing UVs by the PNG's pixel size

**What goes wrong:** the Coriolis samples a 2×2-pixel corner of its atlas; the hull is one flat colour.
**Why:** every vendored model declares `max_x max_y = 1.0 1.0`, so UVs are already normalised even though the texture is 512².
**Avoid:** divide by the *declared* values only.
**Warning sign:** a UV in `[0,1]` before division.

### Pitfall 10: Treating Oolite reals as JSON floats naively

**What goes wrong:** `452760.000000` becomes `452760.0` in one writer and `452760` in another, or `-0` appears, and `assets:check` flaps between machines.
**Why:** two different formatting paths (`toFixed` vs `String`).
**Avoid:** one canonicaliser; `String(n)`; normalise `-0`; ban `toFixed` in the generator.
**Warning sign:** a diff containing only `0.000000` vs `0`.

### Pitfall 11: Verifying drift with `git diff --exit-code`

**What goes wrong:** `assets:check` passes while a generated file is missing from git, and CI ships a build with stale content.
**Why:** `git diff` ignores untracked files.
**Avoid:** regenerate into a temp dir and compare the file *set* plus bytes plus hashes.

### Pitfall 12: Zod schemas that reject tomorrow's data

**What goes wrong:** the D-02 bump adds one key and a dozen schemas throw, blocking a legitimate update.
**Why:** closed `z.object` on files Oolite owns.
**Avoid:** `.passthrough()`/`z.record` for `extras` and `conditions`; `.strict()` only on *our* output records, never on a raw Oolite dict.

### Pitfall 13: `src/content/types.ts` pulling zod into the sim

**What goes wrong:** the sim bundle grows, or `tsconfig.sim.json` fails because a value import drags zod's runtime.
**Why:** `export type X = z.infer<typeof S>` needs `S` in type position only.
**Avoid:** `import type { SystemSchema } from "./schemas/system.js"; export type System = z.infer<typeof SystemSchema>;` — verified to typecheck under `lib: ["ES2022"], types: []` because zod 4.6.7's declarations reference no DOM globals. `[VERIFIED: grep over zod@4.6.7 `*.d.ts` — no `Blob`/`File`/`fetch`/`Request`/`Response` references]`
**Warning sign:** `TS2584 Cannot find name 'File'` from the sim project.

### Pitfall 14: Losing the empty-vs-absent distinction

**What goes wrong:** the Coriolis market becomes blank (or the whole catalogue is blank) because `{}` and `[]` were normalised to `undefined`.
**Why:** `gui-settings.plist` parses to `{}`; five `market_definition` values are comment-only arrays.
**Avoid:** keep an explicit empty node in the AST; model `market_definition` as a discriminated union.
**Warning sign:** a schema error on `market_definition` for `coriolis-station`.

---

## Code Examples

### Canonical JSON writer

```ts
// tools/oolite-ingest/canonical/json.ts
// Rules: sorted code-unit keys, String(n) numbers, -0 normalised, LF, 2-space indent.
// Never `localeCompare`; never `toFixed`.
export function canonicalNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`non-finite number: ${String(n)}`);
  if (Object.is(n, -0)) return "0";
  return String(n); // ECMAScript Number::toString — shortest round-trip, arch-independent
}

function sortKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export function canonicalJson(value: unknown, indent = 0): string {
  // objects → sorted keys; arrays → order preserved; numbers → canonicalNumber
  // ... ~40 lines of straightforward recursion, emitting `\n` and two spaces per level
}
```

Sources for the rules: `package.json:14` (`"lint": "eslint . && prettier --check ."`), `[VERIFIED: .prettierignore:1-10]` (no generated directory listed today), `[VERIFIED: src/sim/hash.ts:29-35]` (the existing `canon` precedent: `if (!Number.isFinite(n)) throw`, `const r = Number(n.toFixed(digits)); return (r === 0 ? 0 : r).toFixed(digits);` — the content pipeline deliberately does **not** reuse `toFixed`).

### Tokenizer core (line/column tracking)

```ts
// tools/oolite-ingest/openstep/tokenizer.ts
type Tok =
  | { k: "punct"; v: "{" | "}" | "(" | ")" | "=" | ";" | ","; line: number; col: number }
  | { k: "string"; v: string; line: number; col: number }
  | { k: "bare"; v: string; line: number; col: number };

function* tokens(src: string): Generator<Tok> {
  let i = 0, line = 1, col = 1;
  const advance = (n = 1) => { for (let k = 0; k < n; k++) { if (src[i] === "\n") { line++; col = 1; } else col++; i++; } };
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { advance(); continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") advance(); continue; }
    if (c === "/" && src[i + 1] === "*") { advance(2); while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) advance(); advance(2); continue; }
    if (c === '"') { /* quoted: decode \n \t \" \\ \b \f \r \ooo, keep line/col of the opening quote */ }
    if ("{}()=;,".includes(c)) { yield { k: "punct", v: c as never, line, col }; advance(); continue; }
    /* bare token: /[^\s,;)}]+/ ; classify yes|no → bool, -?\d+ → int, -?\d*\.\d+ → real, else string */
  }
}
```

Evidence for every branch: `[VERIFIED: full-corpus feature enumeration, §P2.1]` — 7,234 line comments, 212 block comments, 45,159 quoted strings, 91,618 bare keys, 316 bare atoms (`type = flasher;`), octal escapes including `\177`.

### `like_ship` merge

```ts
// tools/oolite-ingest/like-ship.ts
const NON_INHERITABLE = ["display_name", "is_template"] as const;
const ALIAS_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["scan_class", "scanClass"], ["escort_role", "escort-role"], ["escort_ship", "escort-ship"],
  ["is_carrier", "isCarrier"], ["has_shipyard", "hasShipyard"],
];

export function mergeShip(child: PlistDict, parent: PlistDict): PlistDict {
  const out = { ...parent, ...child };
  delete out.like_ship;
  for (const key of NON_INHERITABLE) if (!(key in child)) delete out[key];
  for (const [a, b] of ALIAS_PAIRS) {
    if (a in out && b in out) { if (b in child) delete out[a]; else delete out[b]; }
  }
  return out;
}

export function resolveAll(entries: PlistDict): Map<string, PlistDict> {
  const out = new Map<string, PlistDict>();
  const visiting: string[] = [];
  const visit = (key: string): PlistDict => {
    const cached = out.get(key); if (cached) return cached;
    const i = visiting.indexOf(key);
    if (i >= 0) throw contentError("LIKE_SHIP_CYCLE", path, key, [...visiting.slice(i), key]);
    visiting.push(key);
    const own = entries[key] ?? throw contentError("LIKE_SHIP_DANGLING", path, key, [...visiting, key]);
    const parentKey = own.like_ship;
    const merged = parentKey ? mergeShip(own, visit(String(parentKey))) : omit(own, "like_ship");
    visiting.pop(); out.set(key, merged); return merged;
  };
  for (const key of Object.keys(entries)) visit(key);
  return out;
}
```

Sources: `[VERIFIED: src/Core/OOShipRegistry.m, -mergeShip:withParent:]` for the five pairs and two non-inheritable keys; `[VERIFIED: -applyLikeShips:withKey:]` for the cycle/dangling behaviour and the `is_external_dependency` exemption.

### `.dat` coordinate conversion (the whole contract in six lines)

```ts
// tools/oolite-ingest/convert/glb.ts
// Order matters: repair (per-face mode only) → negate Z → reverse winding.
const p = { x: v.x, y: v.y, z: -v.z };          // positions
const n = { x: n0.x, y: n0.y, z: -n0.z };       // normals (M^-T = M for diag(1,1,-1))
const corners = [c0, c2, c1];                    // reverse: glTF front face is CCW
```

Proof sketch: `cross(Ma, Mb) = det(M)·M^-T·cross(a,b)` with `det(M) = -1`; the source order yields `-n`, so reversed corners yield `+M·n = n'`. Empirically confirmed: all 2,226 Coriolis faces have `dot(storedNormal, normalize(cross(v1−v0, v2−v0))) < 0`.

### GLB container

```ts
// header: magic 0x46546C67 ("glTF"), version 2, total length
// chunk 0: JSON, length padded to 4 with 0x20 (space)
// chunk 1: BIN,  length padded to 4 with 0x00
// asset: { version: "2.0", generator: "wegolite-oolite-ingest/1" }   ← ours, fixed (D-05)
// accessors: POSITION (VEC3/FLOAT, min+max), NORMAL (VEC3/FLOAT), TEXCOORD_0 (VEC2/FLOAT)
// one primitive per Oolite material, one mesh per .dat, one node per subentity with a local transform
```

### Emissive bake (alpha → greyscale PNG)

```ts
// tools/oolite-ingest/convert/textures.ts
// 1. inflate IDAT, unfilter rows (8-bit RGBA, non-interlaced — verified for all sampled textures)
// 2. grey = alpha (0..255), RGB = grey, A = 255 (opaque)
// 3. emit 8-bit greyscale (colour type 0), filter 0 per scanline,
//    deflateSync(raw, { level: 9, strategy: zlib.constants.Z_FIXED, memLevel: 9, windowBits: 15 })
// 4. CRC32 per chunk (integer-only, deterministic)
```

The `Z_FIXED` + explicit level/memLevel/windowBits + filter-0 combination is the determinism lever; see §P6.4 for the fallback.

---

## State of the Art

| Old approach | Current approach | When changed | Impact |
|--------------|------------------|--------------|--------|
| Port Oolite's `commodities.plist` 8-bit price formula | `OOCommodities.m` economy-only formula using `trade-goods.plist` | Oolite 1.81 | Phase 2 stores raw `price_average`/`price_economic`/`price_random`; Phase 5 owns the formula. |
| Parse plists at runtime | Build-time compilation to typed JSON | project decision | No plist parser ships to the browser. |
| `git diff --exit-code` drift check | Regenerate to a temp dir and compare bytes + SHA-256 | project decision (D-04/D-05) | Catches untracked and missing files, not just modified ones. |
| A GLB authoring library owns byte layout | In-repo writer, library used as reader | this research | Removes the package-version re-baseline hazard from `asset.generator`. |
| `smoothGroup` assumed to partition normal averaging | `smoothGroup` only partitions the *edge-vertex fallback*; interior vertices use the global average | Oolite's actual `setUpVertexArrays` | Affects only `smooth = yes` models; none of the two v1 models use it, but the converter must be correct for the catalogue. |

**Deprecated/outdated in the project's own research, corrected here:**
- "`like_ship` overlay order: base → template → variant → `shipdata-overrides.plist`" — overrides are applied **before** resolution.
- "the Cobra's faceted look depends on `smooth = NO`" — the Cobra has no `smooth` key and is in `explicit` normal mode.
- "UVs are texel units divided by the declared texture size" — true, but the declared size is `1.0 1.0` on every vendored model, so the division is a no-op here; the trap is dividing by pixel dimensions.
- "TEXTURES is optional" — it is optional in Oolite (placeholder material), but present in all five vendored models; still implement the placeholder path for the failure fixture.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Identical pinned zlib builds produce identical deflate output across arm64/amd64 (integer-only algorithm) | §P6.4 | `assets:check` flakes across architectures; mitigation is the stored-block deflate fallback, and the probe must run early. |
| A2 | Identity UV mapping (no V flip) is correct, because both Oolite's GL upload and glTF put `v=0` at the image's top row | §P4.4 | Models render with vertically mirrored textures; the asymmetric fixture is the falsification step and must land with the converter, not after it. |
| A3 | `roughness = clamp(1 - gloss, 0.04, 1)` is an acceptable approximation for D-08 | §P5.3 | Materials look too glossy or too flat; reversible via `extras.oolite`, and Phase 7 owns look-dev. |
| A4 | The ~18.8 MiB of verbatim PNGs is acceptable for Phase 2 and compression stays in Phase 7 | §P4/§Textures | Slower first load and a larger repo; does not affect correctness. |
| A5 | The catalogue should not apply Oolite's missing-model prune | §P3.4 | A consumer expecting Oolite's 102 usable ships gets 102 entries but only 7 with `modelVendored: true`; the flag makes the difference explicit. |
| A6 | `@gltf-transform/core` 4.5.1 accepts our GLB bytes and round-trips them | §P5.5 | If it rejects a legal-but-unusual layout, the writer needs a minor fix; nothing is re-baselined. |
| A7 | Emitting the shipdata catalogue as a typed projection + `extras` is faithful enough for D-11 | §P3.4 | A later phase needs a key that was dropped; mitigation is that `extras` carries every resolved key verbatim. |

**If this table is non-empty, the planner should convert A1, A2 and A5 into explicit verification tasks.** A1 and A2 have concrete falsification steps; A5 is a documented divergence that needs a one-line note in the plan.

## Open Questions (RESOLVED)

All questions raised by the research focus are resolved below with a recommendation and a confidence. Nothing is left open for the planner to guess.

1. **Per-face vs explicit vs smooth normals (refines D-09's wording).**
   - What we know: the Cobra carries a 1,548-line `NORMALS` block and zero face normals; Oolite sets `explicit` mode when the block exists, overriding `smooth`. The Coriolis parts are `smooth = 0` with no `NORMALS` ⇒ per-face.
   - Resolution: implement all three modes with the selection order *explicit → smooth → per-face* (§P4.2). This satisfies success criterion 3 ("per-face normals by default") for the default path while keeping the Cobra identical to Oolite.
   - Confidence: HIGH. Evidence: `oolite_cobra3.dat:1564` and `:3723-5272`; `src/Core/OOMesh.m:1394-1420`, `:1707-1790`.

2. **V-flip or not.**
   - What we know: Oolite divides UVs by declared size and uploads unflipped; glTF defines `v=0` at the top; `GLTFLoader` sets `flipY = false`.
   - Resolution: expect identity (no flip), and gate it on the asymmetric fixture — a synthetic 8×8 PNG with four distinct quadrants and a marked corner, a two-triangle quad, asserting the sampled corner at a known UV. If the fixture disagrees, flip `t → 1 - t` in the converter only.
   - Confidence: MEDIUM-HIGH for identity, HIGH that the fixture is the right decision procedure.

3. **GLB writer: library or in-repo.**
   - Resolution: in-repo writer for the bytes; `@gltf-transform/core` `NodeIO.readBinary` in tests as an independent reader.
   - Confidence: HIGH (the `asset.generator` re-baseline hazard is decisive).

4. **Do we apply Oolite's missing-model prune?**
   - Resolution: no. Emit `modelVendored: boolean` and keep all 102 usable entries.
   - Confidence: HIGH (D-01 vendors two models by design).

5. **Is `like_ship`'s overlay order observable in the pinned snapshot?**
   - Resolution: no — the only override key (`griff_spacebar_subent_template`) does not exist in `shipdata.plist`, so `loadAndApplyShipDataOverrides` is a no-op and the entry count is 194 in and 194 out. Implement the correct order anyway (pre-resolution patching) and assert the entry count as a fixture.
   - Confidence: HIGH.

6. **Does `shipdata-overrides.plist` add entries?**
   - Resolution: no; it patches existing keys only. Assert that `griff_spacebar_subent_template` is absent from the output catalogue.
   - Confidence: HIGH (`-loadAndApplyShipDataOverrides` skips absent keys).

7. **Should `smoothGroup` partition normal averaging?**
   - Resolution: only at edge vertices (vertices shared by faces with different smooth groups); interior vertices use the global area-weighted average. Implement it, but no v1 model exercises it — so cover it with a fixture rather than real data.
   - Confidence: HIGH (`setUpVertexArrays` and `getNormal:...inSmoothGroup:`).

8. **Tech-level label array.**
   - Resolution: none exists. Compile `economy`, `government`, `legal_status`, `rating`, `inhabitants`, `system_description`, plus `sysdata-*` format templates. TL display is `raw + 1` in the UI (D-25).
   - Confidence: HIGH (1,144 keys enumerated).

9. **Where do generated assets live — `public/` or `src/content/`?**
   - Resolution: JSON under `src/content/generated/`; GLB and PNG under `public/models/` and `public/textures/`, fetched by URL. This matches `STACK.md`'s asset pipeline and keeps `base: './'` URLs simple (`new URL("models/x.glb", import.meta.url)` or `import.meta.env.BASE_URL`).
   - Confidence: HIGH.

10. **How is the exporter invoked, given `docker compose run` cannot name `ci`?**
    - Resolution: add one Compose service (`assets`) whose default command is `npm run assets:build`, and call `assets:check` **inside** the `verify` chain. Document the service in both `AGENTS.md` and `README.md` in the same commit (Pitfall 1).
    - Confidence: HIGH (`compose.yaml` header comment: "`ci` is a Dockerfile stage and the image tag `wegolite-ci`, NOT a Compose service").

11. **Does adding `tools/**/*.test.ts` change any pinned contract?**
    - Resolution: no. `vitest.config.ts:18` is not asserted by the contract test; add `"tools/**/*.test.ts"` to the include array (or place ingest tests under `tests/ingest/`). Adding the glob is preferable — it keeps the test beside the converter.
    - Confidence: HIGH.

12. **arm64↔amd64 proof shape.**
    - Resolution: a `scripts/check-arch-determinism.sh` that runs `assets:build` in an arm64 container and an amd64 container from the same image digest, then `diff -r` the output trees and compares the manifests. Documented as a manual/CI-only check (like `check-verify-fails-fast.sh`), because `docker compose run` cannot itself select a platform per invocation. Where a genuine exclusion is ever needed, it goes in a written list in the script header — D-06 forbids anything else.
    - Confidence: MEDIUM (mechanism is sound; the arm64 host availability is an environment question, see below).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Docker + Compose | Every command (AGENTS.md) | ✓ (Phase 1 green) | — | none — this is the project's only execution path |
| `node:24-bookworm-slim` image | Toolchain | ✓ (pinned by digest) | v24.22.2 in-image | none |
| Network access to `raw.githubusercontent.com` / `api.github.com` | One-time snapshot vendoring + bump script | ✓ this session | — | the committed `third_party/` tree; builds never need network |
| arm64 Docker host or QEMU/buildx | D-06 proof | ✗ on this host (x86_64 Linux) | — | `docker buildx build --platform linux/arm64` under QEMU, which is slow but sufficient for a byte comparison; otherwise defer to CI's arm64 runner. Record whichever is used in the script header. |
| A GLB reader for tests | §P5.5 | ✗ until installed | `@gltf-transform/core@4.5.1` | none needed — this is a planned install |
| Image tooling for the emissive bake | §P4 | ✗ (deliberately) | — | `node:zlib` + ~40 lines of PNG parsing |

**Missing dependencies with no fallback:** none that block planning.
**Missing dependencies with fallback:** arm64 execution (QEMU or CI runner), and the emissive bake (stdlib only by design).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `5.0.5`, single project `unit`, `environment: "node"` `[VERIFIED: vitest.config.ts:12-20]` |
| Config file | `vitest.config.ts` — include globs are `["src/**/*.test.ts", "tests/**/*.test.ts"]`; add `"tools/**/*.test.ts"` `[VERIFIED: vitest.config.ts:18]` |
| Quick run command | `docker compose run --rm test` (~7 s today) |
| Full suite command | `docker compose run --rm verify` (lint → typecheck → assets:check → test → build → e2e) |
| Drift command | `docker compose run --rm assets npm run assets:check` (service command overridden to run the check) |
| Property tests | `fast-check@4.10.2`, in the same node project |

### Phase Requirements → Test Map

| Req ID | Behaviour | Test type | Automated command | File exists? |
|--------|-----------|-----------|-------------------|--------------|
| DATA-01 | Parses all 40 vendored plists; handles comments, bare/quoted keys, octal escapes, duplicates last-wins, empty dict/array | integration | `docker compose run --rm test npm test -- tools/oolite-ingest/openstep/parser.test.ts` | ❌ Wave 0 |
| DATA-01 | Malformed plist reports code `PLIST_PARSE` + file + line/column + excerpt | unit (fixture) | same | ❌ Wave 0 |
| DATA-02 | `like_ship` resolution matches Oolite's merge (194 in → 194 out, 81 templates, 102 usable, depth 3) | golden | `docker compose run --rm test npm test -- tools/oolite-ingest/like-ship.test.ts` | ❌ Wave 0 |
| DATA-02 | Cycle prints the whole chain, code `LIKE_SHIP_CYCLE`; dangling reports `LIKE_SHIP_DANGLING`; resolution is order-independent | unit + property | same | ❌ Wave 0 |
| DATA-03 | All five `.dat` files parse; comma separators; face counts and bboxes match §P4.1; `> 3` truncation fixture warns and keeps three | unit + golden | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/dat.test.ts` | ❌ Wave 0 |
| DATA-04 | GLB bytes are byte-identical across two runs; `NodeIO.readBinary` round-trips; primitive count == material count; bbox assertions hold; dock node transform is `(0,0,-500.2561)` | unit + reader | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/glb.test.ts` | ❌ Wave 0 |
| DATA-04 | Asymmetric fixture proves UV handedness and the un-mirrored letterbox (signed UV-vs-geometry area agreement on the dock's mouth faces) | unit (fixture) | same | ❌ Wave 0 |
| DATA-05 | 8 × 256 systems, ids `g{galaxy}-s{index}`, Lave pinned to every value in §Systems, `percent_cloud` present only on Lave | golden | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/systems.test.ts` | ❌ Wave 0 |
| DATA-06 | 17 commodities, decicredit integers, unit tags t/kg/g, `alien_items.tradeable === false` | golden | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/commodities.test.ts` | ❌ Wave 0 |
| DATA-07 | 41 equipment entries with preserved condition metadata; Lave available as `g0-s7`; Cobra + Coriolis resolved and converted | golden | `docker compose run --rm test npm test -- tools/oolite-ingest/convert/{equipment,ships}.test.ts` | ❌ Wave 0 |
| DATA-08 | `assets:check` fails, naming the file, on one mutated byte; fails on a missing file; fails on an extra file | integration | `docker compose run --rm verify` (assets:check stage) + `docker compose run --rm test npm test -- tools/oolite-ingest/drift.test.ts` | ❌ Wave 0 |
| DATA-09 | `SOURCE.md` names `1.93.1-241` / `7437f22`; every `third_party` file has an `ASSETS.md` row with a matching SHA-256 | unit (contract) | `docker compose run --rm test npm test -- tests/compliance-assets.test.ts` | ❌ Wave 0 |
| QUAL-06 (partial) | `README`/`AGENTS.md` document the new commands; service-set equality still holds | contract | `docker compose run --rm test npm test -- tests/contract/container-contract.test.ts` | ✅ exists, must be updated |
| SAVE-02/ECON-02/03 (foundation) | Stable ids and integer units available for later persistence/economy | covered by DATA-05/06/07 goldens | — | — |

### Sampling Rate

- **Per task commit:** `docker compose run --rm test` (target < 60 s; today ~7 s, expect ~15 s with 200+ ingest tests).
- **Per wave merge:** `docker compose run --rm verify`.
- **Phase gate:** `verify` green **in the container**, plus the arm64/amd64 determinism script executed once and its result recorded.
- **Max feedback latency:** 60 s.

### Wave 0 Gaps

- [ ] `tests/fixtures/plist/` — malformed plist, comment-only array, empty dict, octal escapes, duplicate keys, quoted-key-with-space.
- [ ] `tests/fixtures/shipdata/` — 4-entry synthetic file with a cycle and a dangling reference.
- [ ] `tests/fixtures/dat/` — a 3-face quad `.dat` (truncation), a `.dat` with a comma-free format, a truncated/broken `.dat`.
- [ ] `tests/fixtures/textures/` — the 8×8 asymmetric PNG for the UV/V-flip test.
- [ ] `tests/golden/content/lave.json`, `commodities.json`, `equipment.json`, `ship-bounds.json` — pinned expected values (§Systems, §Commodities, §Equipment).
- [ ] `src/content/schemas/*.ts` + `src/content/types.ts` — the zod surface the goldens validate against.
- [ ] `"tools/**/*.test.ts"` added to `vitest.config.ts:18`.
- [ ] `assets` Compose service + `assets:build` / `assets:check` npm scripts + updated `verify` chain + updated contract assertion + `AGENTS.md`/`README.md` rows.
- [ ] `src/content/generated` and `third_party` added to `.prettierignore`.
- [ ] No framework install needed — Vitest/Playwright are already in the `ci` stage.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` in `.planning/config.json`. This phase is build-time only, but it processes untrusted-shaped data and writes provenance claims.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No users, no accounts. |
| V3 Session Management | no | Static client. |
| V4 Access Control | no | No server surface. |
| V5 Input Validation | **yes** | zod at every boundary: parsed plist → typed record; emitted record → schema; runtime manifest → schema. Parser never `eval`s, never `new Function`, and has an explicit recursion cap. |
| V6 Cryptography | no (integrity only) | `node:crypto` SHA-256 for drift detection is an integrity check, not a security control; the in-repo FNV-1a stays for goldens and is documented as non-cryptographic. |
| V7 Error handling & logging | yes | `ContentError` must never echo a whole file into logs — excerpt capped at 120 characters, single line. |
| V12 Files & resources | yes | The generator reads only under `third_party/oolite/` (path-joined and asserted to stay inside the snapshot root) and writes only under `src/content/generated/`, `public/models/`, `public/textures/`. `--check` writes only to an `os.tmpdir()` child created with `mkdtemp`. |

### Known Threat Patterns for a build-time content compiler

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via a plist value (`model = "../../etc/passwd"`) | Tampering | Resolve every referenced file against the snapshot root and reject any resolved path that escapes it; report `TEXTURE_MISSING`/`DAT_MESH` with the attempted path. |
| Prototype pollution from a `__proto__` key in a parsed dict | Tampering | Store dicts as `Map<string, PlistValue>` (or `Object.create(null)`); never `obj[key] = value` on a plain literal with attacker-shaped keys. This is real: the corpus has 111 duplicate keys and keys with brackets and `@`. |
| Decompression bomb / huge mesh in a future bump | DoS (build) | Cap `NVERTS`/`NFACES` (say 200k each) and PNG dimensions (say 8192²); fail with `DAT_MESH`/`TEXTURE_MISSING` rather than allocating. |
| Silent substitution of a missing asset | Repudiation (provenance) | D-21: no placeholders, ever. A missing texture is a build failure naming the referencing ship and material. |
| `ASSETS.md` drift (a vendored file with no row, or a stale hash) | Repudiation | Compliance test walks `third_party/**` and requires a row per file plus a matching SHA-256. |
| `eval`/`new Function` in the parser | Elevation | Never; `eslint` `no-eval`-class rules already apply via `js.configs.recommended`. Add `no-new-func` explicitly to the tools zone. |
| Generated JSON injected into the DOM later | XSS (downstream) | Out of scope for Phase 2, but the content is treated as text and Phase 5 must use `textContent`; note it in the phase notes so it is not forgotten. |

## Sources

### Primary (HIGH confidence — read this session)

**Pinned Oolite tree, commit `7437f22` (release `1.93.1-241`), fetched from `raw.githubusercontent.com/OoliteProject/oolite/7437f22/…`:**

- `Resources/Config/planetinfo.plist` — 2,050 top-level keys, 2,048 system entries, 40 universal keys, Lave at `:321-363`, `percent_cloud` only on Lave.
- `Resources/Config/trade-goods.plist` — 17 commodities, `quantity_unit` 0/1/2, integer decicredits.
- `Resources/Config/equipment.plist` — 41 six-element positional arrays, 21 distinct condition keys.
- `Resources/Config/shipdata.plist` — 194 entries, 137 `like_ship`, 81 templates, Cobra template `:1226-1353`, player template `:1437-1443`, Coriolis template `:1690-1878`, `market_definition` tri-state at `:1702`, `:1891`, `:2348`, `:3256`, `:3372`, `smooth` value variants at `:4637`–`:4950`.
- `Resources/Config/shipdata-overrides.plist` — 9 lines, one unrelated entry.
- `Resources/Config/descriptions.plist` — 1,144 keys; `economy`/`government`/`legal_status`/`rating`/`inhabitants`/`system_description`; no tech-level array.
- `Resources/Config/shipyard.plist` — 11 player entries, `price` in credits.
- All 40 `Resources/Config/*.plist` — full-corpus grammar enumeration (§P2.1).
- `Resources/Models/oolite_cobra3.dat`, `oolite_coriolis.dat`, `oolite_coriolis_faceplate.dat`, `oolite_coriolis_tris.dat`, `oolite_coriolis_dock.dat` — section layout, counts, bboxes, comma separators, zero face normals, `NAMES`, `NORMALS`.
- `Resources/Textures/oolite_cobra3_diffuse.png`, `oolite_coriolis_diffuse.png`, `oolite_coriolis_dock_diffuse.png`, `oolite_cobra3_subents.png` — IHDR (RGBA, 8-bit, non-interlaced) and the alpha histogram (255,920 / 262,144 transparent).
- `Resources/Schemata/shipdataEntrySchema.plist` — 153 shipdata keys (the drift allowlist).
- `src/Core/OOShipRegistry.m` — `loadShipData` stage order, `loadAndApplyShipDataOverrides`, `applyLikeShips:withKey:`, `mergeShip:withParent:`, `removeUnusableEntries:shipMode:`.
- `src/Core/OOMesh.m` — `NVERTS`/`NFACES`/`VERTEX`/`FACES` (`:1208-1300`), `TEXTURES` (`:1304-1370`), `NAMES`/`NORMALS` (`:1372-1420`), `checkNormalsAndAdjustWinding` (`:1488-1526`), `setUpVertexArrays` (`:1707-1790`).
- `src/Core/OOVector.h` — `normal_to_surface` (`:309-315`), `cross_product` (`:294-297`).
- `src/Core/OOCollectionExtractors.m` — `OOBooleanFromObject`/`BooleanFromString` (`:1124-1147`), `OOVectorFromObject` (`:1236-1270`).
- `src/Core/OOColor.m` — `+colorFromString` (`:210-231`).
- `src/Core/Entities/ShipEntity.m` — `model_scale_factor` default `1.0` (`:261`), `smooth` default `NO` (`:406`).

**In-repo (read this session):**

- `package.json:9-17` — pinned script strings.
- `compose.yaml:74-78` — the `verify` chain.
- `tests/contract/container-contract.test.ts:264-269, 281-283, 390-397` — script pins, chain pin, service-set equality.
- `tests/compliance.test.ts:42, 63-79, 171-178` — SPDX walk and its skip list.
- `vitest.config.ts:12-20` — node project and include globs.
- `tsconfig.sim.json:19` — sim project include.
- `eslint.config.js:63` — sim zone file glob.
- `.prettierignore:1-10` — current ignores.
- `ASSETS.md:13` — the eight-column provenance header.
- `src/sim/hash.ts:1-35` — `fnv1a32` and `canon`.
- `Dockerfile:7` — the pinned base image digest.

**npm registry (queried 2026-11-03):** `zod@4.6.7`, `@gltf-transform/core@4.5.1`, `tsx@4.23.15`, `fast-check@4.10.2`; `gsd-tools query package-legitimacy check` verdicts.

**Third-party source:** `three@0.187.0` `examples/jsm/loaders/GLTFLoader.js:3366` (`texture.flipY = false`); `@gltf-transform/core@4.5.1` `dist/index.js` (`generator: \`glTF-Transform ${VERSION}\``).

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` §Pattern 3 — build-time compilation pattern, per-galaxy chunking.
- `.planning/research/PITFALLS.md` Pitfalls 3–5 — unit traps, plist inheritance, `.dat` import (three specific corrections are recorded above).
- `.planning/research/STACK.md` — package approvals, asset-pipeline shape, 20 MB compression trigger.
- `.planning/research/FEATURES.md` §A–D — commodity table, economy/government tables, flight constants (all re-verified against the snapshot where they overlap Phase 2).

### Tertiary (LOW confidence)

- Cross-architecture byte equality (A1) — reasoned, not measured.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — four packages verified on the registry with legitimacy verdicts; the pinned Node image and tsconfig constraints read from the tree.
- Oolite data/semantics: HIGH — every number in this document was extracted from the pinned commit this session, including the corrections to the project's earlier research.
- Architecture/patterns: HIGH — the merge rules, mesh grammar, normal modes and vertex layout are quoted from Oolite's own source.
- Determinism plan: MEDIUM — the mechanism is sound and the banned-API list is complete, but arch equality is unproven until the probe runs.
- Pitfalls: HIGH — most are derived from the exact strings that will break (contract assertions, Prettier, comma separators, zero normals).

**Research date:** 2026-11-03
**Valid until:** the next Oolite bump (the data findings are pinned to `7437f22`); treat the tooling findings (Vitest/Three/zod versions) as good for ~30 days.

