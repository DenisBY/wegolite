---
phase: "02"
slug: "data-pipeline-content-compiler"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-03"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time across the nine plans of the phase; this document is the
> verification record against the implemented code (state B: run from artifacts).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Network → `third_party/oolite/` | One-off vendor step fetches the pinned Oolite snapshot (`1.93.1-241` / `7437f22`). Builds never touch the network. | Untrusted upstream bytes, pinned by commit and re-hashed into `CHECKSUMS.sha256` |
| Snapshot bytes → parser | OpenStep `.plist`, `.dat`, PNG and texture files are untrusted input to `tools/oolite-ingest/**` | Text and binary; parsed into typed values |
| Build-time generator → `src/content/generated`, `public/models`, `public/textures` | Generated artefacts are written under a caller-supplied root | Compiled, non-executable content |
| `src/content` → `src/sim` | Type-only import door; runtime content import is forbidden by ESLint and `tsconfig.sim.json` | Types only; no runtime data |
| `src/content` → `src/main.ts` (boot) | Manifest is validated before the renderer exists | Manifest fields and file rows |
| npm registry / base image → build | Four pinned packages installed via `npm ci` from the committed lockfile inside a digest-pinned image | Dependency code |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Elevation of privilege | `tools/oolite-ingest/openstep/parser.ts` | high | mitigate | Recursive-descent parser only: no `eval`, no `new Function`, no dynamic `require`. `MAX_DEPTH = 64` bounds recursion (`parser.ts:26`, checked at `:90`). Malformed input throws `ContentError` with code/file/line/column rather than being coerced. | closed |
| T-02-02 | Denial of service / Tampering | `tools/oolite-ingest/like-ship.ts` resolver | high | mitigate | DFS with an explicit visiting stack, memoisation, a 64-depth cap, `LIKE_SHIP_CYCLE` carrying the closed chain (`:197`, `:205`), and `LIKE_SHIP_DANGLING` for a missing target (`:214`). Cycle cannot hang the build or be silently dropped; order-independence property proves resolution is a join. | closed |
| T-02-03 | Tampering | `tools/oolite-ingest/convert/dat.ts` grammar and section scanning | high | mitigate | Sections matched in order with explicit required tokens; `n_v` outside range handled exactly as Oolite; every component `Number.isFinite`; every index range-checked before use; missing `END`/short section throws `DAT_MESH` (`:139`, `:311`). | closed |
| T-02-04 | Tampering | `tools/oolite-ingest/convert/glb.ts` axes, winding, normals, dock transform | high | mitigate | One conversion function; `position' = (x, y, -z)` with authored corner order `c0,c1,c2` preserved; every emitted triangle asserted against the converted Oolite face normal (`dot > 0`, `:25`); `negate()` normalises Z (`:494-500`); dock translation asserted exactly `[0, 0, -500.2561]`; bounds pinned per node. | closed |
| T-02-05 | Tampering | `tools/oolite-ingest/convert/systems.ts` IDs, ordering, units | high | mitigate | ID derived only from the `"<g> <i>"` key; key outside pattern throws `SCHEMA` (`:89`, `:107`); each chunk asserted at exactly `SYSTEMS_PER_GALAXY = 256` (`:41`); `radiusKm`/`techLevelRaw` stored raw; Lave golden pins every field. | closed |
| T-02-06 | Tampering | `tools/oolite-ingest/convert/commodities.ts` | high | mitigate | `quantity_unit` mapped through an explicit 0/1/2 table (`:163-164`); every other value throws `SCHEMA`; `priceAverage` asserted integer decicredits while the five `price_*`/`quantity_*` ratios stay authored reals (no `.int()` coercion); `tradeable` false only for `alien_items`; exact 16-key tradeable set pinned. | closed |
| T-02-07 | Tampering | `tools/oolite-ingest/convert/equipment.ts` positional tuples and prices | high | mitigate | `tuple6()` guard rejects short or mistyped tuples with `SCHEMA` naming file and key (`:113`); prices stay integer decicredits with explicit `priceUnit: "decicredits"` (`:193`); 41 TL/price anchors pinned. | closed |
| T-02-08 | Repudiation | `tools/oolite-ingest/cli.ts` `--check` | high | mitigate | Regenerates into `mkdtemp`, compares file set + bytes + SHA-256 against the committed manifest, prints per-file labels, exits 1 (`USAGE` `:49-52`). No git dependency, no override flag, no allowlist. `drift.test.ts` proves all four failure classes. | closed |
| T-02-09 | Repudiation | `ASSETS.md` / `third_party/oolite/CHECKSUMS.sha256` | high | mitigate | Vendor script recomputes CHECKSUMS from the bytes it wrote; ASSETS rows copy those hashes; `tests/compliance-assets.test.ts` re-hashes all 65 vendored files and fails on a missing row or mismatch. | closed |
| T-02-10 | Tampering | `tools/oolite-ingest/generate.ts` write scope | high | mitigate | Every output path resolved through `resolveOutputFile(outRoot, relativePath)` (`:84`) and asserted inside `outRoot`; every input path asserted inside `third_party/oolite/`; `--check` writes only inside its `mkdtemp` and removes it in `finally`. | closed |
| T-02-11 | Tampering | `tools/oolite-ingest/openstep/plist-value.ts` dictionary storage | high | mitigate | Dictionaries are entry arrays plus `Map` (`dictToMap`, `:65`); no `obj[key] = value` on a plain literal, so `__proto__`/`constructor` keys cannot pollute a prototype. Test parses a `__proto__` key and asserts `Object.getPrototypeOf({})` unchanged. | closed |
| T-02-12 | Denial of service | `tools/oolite-ingest/openstep/parser.ts` recursion and tokenizer input | medium | mitigate | 64-level recursion cap throwing `PLIST_PARSE`; no unbounded lookahead; tokenizer is a single linear pass. `fast-check` property asserts only `ContentError` escapes for arbitrary strings, catching a stack overflow surfacing as `RangeError`. | closed |
| T-02-13 | Information disclosure | `tools/oolite-ingest/content-error.ts` excerpt and `formatContentError` | medium | mitigate | `MAX_EXCERPT = 120` (`:33`) with whitespace collapsed to one line; `file` is repo-relative; no host path and no whole-file echo. Asserted by `failure-contract.test.ts`. | closed |
| T-02-14 | Tampering | `tools/oolite-ingest/convert/systems.ts` / `convert/labels.ts` encoding and ordering | medium | mitigate | Strings emitted as exact UTF-8 code points with no normalization; ordering uses numeric `systemIndex` or code-unit key order, never `localeCompare` or display names; `canonicalJson` sorts keys by code unit. | closed |
| T-02-15 | Denial of service | `tools/oolite-ingest/convert/dat.ts` declared counts | high | mitigate | `NVERTS > 200000` or `NFACES > 200000` throws before allocation; faces streamed one line at a time into pre-sized arrays only after the cap check; a 300,000-vertex fixture proves the failure. | closed |
| T-02-16 | Tampering | `tools/oolite-ingest/convert/ships.ts` `model` resolution | high | mitigate | Every model value joined under `third_party/oolite/Models/` and asserted to stay inside it; `..` and absolute paths throw `DAT_MESH` naming entry and attempted path. | closed |
| T-02-17 | Tampering | `CatalogEntry.extras` and `shipDef.materials` | medium | mitigate | Both are open `z.record` values, never evaluated; no `eval`, no condition-script interpreter, no property assigned onto a plain object from a plist key (dictionary storage stays `Map`/entry arrays). Downstream consumers must treat them as data. | closed |
| T-02-18 | Tampering / Denial of service | GLB buffer construction | high | mitigate | Accessors sized from actual `Float32Array` lengths; all offsets 4-byte aligned before every bufferView (`bytes.length % 4`, `:205`); `setUint32` little-endian with explicit lengths (`:229`, `:473-474`); a single `Uint8Array` allocated once; `@gltf-transform` reads the result back independently in tests. | closed |
| T-02-19 | Denial of service | `tools/oolite-ingest/convert/textures.ts` `decodePng` inflate and dimensions | high | mitigate | `IHDR` validated before any inflate: bit depth 8, colour type 6, interlace 0, width/height ≤ `MAX_TEXTURE_DIMENSION = 8192` (`:309`, `:320`). 16-bit, interlaced and 9000-wide fixtures each throw `TEXTURE_MISSING` (`:114`) naming the reason, so a decompression bomb cannot allocate. | closed |
| T-02-20 | Tampering / Repudiation | `tools/oolite-ingest/convert/textures.ts` `copyTextures` / `resolveReferencedTextures` | high | mitigate | Every read path joined under `TEXTURES_DIR = "third_party/oolite/Textures"` (`:47`) and asserted inside it; `..` name throws with attempted path; missing reference throws `TEXTURE_MISSING` naming ship and material (`:139`); no placeholder or fallback path exists. | closed |
| T-02-21 | Tampering | Generator determinism, both engines and architectures | high | mitigate | ESLint determinism zone at `eslint.config.js:144` (`files: ["tools/oolite-ingest/**/*.ts"]`, `no-restricted-properties`, `localeCompare` selector `:204-206`) bans engine-dependent `Math`, `Intl`, `toFixed`/`toPrecision`, `Date`, `Math.random`; `scripts/check-arch-determinism.sh` regenerates under both platforms and compares file set, bytes, per-file SHA-256 and manifests. Seeded probes prove each rule fires. | closed |
| T-02-22 | Repudiation | Exclusion handling in `scripts/check-arch-determinism.sh` | high | mitigate | Exclusion list is a written header section (`# EXCLUSIONS`, `:24`), currently empty; no flag, environment variable or skip path; `exit 2` for an unrunnable environment (`:56`, `:126`) distinct from `exit 1` for a real diff (`:195`), so an unmeasured platform is never recorded as success. | closed |
| T-02-23 | Tampering | `src/content/index.ts` manifest validation and `src/main.ts` boot | high | mitigate | `assertContentManifest` validates `format`, `schemaVersion`, the pin and every file row; mismatch throws `ContentBoundaryError` (`index.ts:24`, name `:27`) naming the failing path before the renderer exists, so the app cannot boot into a plausible blank state. Status line written with `textContent` (`main.ts:162-163`). | closed |
| T-02-24 | Elevation of privilege / Tampering | `src/sim` → `src/content` import boundary | high | mitigate | ESLint `no-restricted-imports` denies `**/content/index*`, `**/content/schemas/**`, `**/content/generated/**` (`eslint.config.js:92-94`); a seeded probe proves the rule fires and a positive probe proves the type-only door still works; `tsconfig.sim.json` independently keeps DOM types out. | closed |
| T-02-25 | Cross-site scripting (downstream) | Content consumed by the Phase 5 UI | medium | accept | Phase 2 emits content as data only and never injects it into the DOM. Risk is downstream; recorded so Phase 5 uses `textContent` and never `innerHTML` for names, descriptions or localisation tokens (already the case for the current status line). | closed |
| T-02-SC | Tampering | npm installs and base-image pulls | high | mitigate | Package legitimacy is a `gate="blocking-human"` checkpoint before install (zod is `[SUS]` on recency only); versions are bare and exact; `npm ci` runs from the committed 201-entry lockfile inside the digest-pinned image; no `postinstall` in any approved package. No package is added by plans 02-02 .. 02-09. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (`high`) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Result:** 26 threats, 25 mitigated, 1 accepted, **0 open at or above `high`**.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-02-01 | T-02-25 | Phase 2 produces content as inert data; it introduces no DOM injection surface. Downstream rendering (Phase 5) is responsible for using `textContent`, which the current status line already does. | phase 02 verification (end-of-phase gate) | 2026-11-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-03 | 26 | 26 | 0 | execute-phase orchestrator (state B, artifact re-verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-03
