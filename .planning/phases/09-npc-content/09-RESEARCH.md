# Phase 9: NPC Content - Research

**Researched:** 2026-11-13
**Domain:** Build-time content pipeline extension (Oolite `.dat` meshes and PNG textures to GLB and WebP, a compiled ship record set, lazy runtime loading, provenance and drift gates)
**Confidence:** HIGH (every finding below was checked against the repository, the Oolite checkout at the pinned commit, or a measurement run in the project container)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Use a small set, not every record carrying a role. Target 1-3 models per role, about 9-10 new models: Viper (police); Adder, Moray and/or Python (trader); Sidewinder, Mamba and/or Krait (pirate); Gecko (hunter); Shuttle (shuttle); Cobra Mk I (scavenger). The researcher confirms the exact list against the `roles` fields and the vendored plist; the Cobra Mk III model is already vendored. Remaining role models join with the populator when it needs them. — **Reversibility:** reversible — adding a model later is another vendor-script entry plus drift-gate regeneration.
- **D-02:** Only records whose model is in the chosen set are compiled with the NPC field list. Variants that reuse a chosen model (pirate/trader variants, `oolite_template_*` duplicates) are included only if the first populator needs that role string; the planner decides per record and states why.
- **D-03:** Per ship, vendor and encode diffuse + normal + specular maps (the same material path as the Cobra Mk III), as WebP via the existing texture encoder and `texture-encodings.json`. Illumination maps only where the Oolite material already uses them for that ship. — **Reversibility:** costly — dropping maps later changes the material path and goldens.
- **D-04:** Sub-entities (flashers, lasers) are not compiled into models in this phase; sub-entity data is not part of the inert-world field list.
- **D-05:** No sound, music, pod, missile, capsule, wreckage or asteroid assets. Every vendored file is recorded in `ASSETS.md`, `NOTICE` and `CHECKSUMS.sha256`; `assets:check` fails on drift.
- **D-06:** Record fields: roles, AI name, scan class, model, from `shipdata.plist` with `like_ship` resolved. Worked examples pin at least the Viper, one trader and one pirate.
- **D-07:** NPC models and textures sit outside the first-load set; a cold start fetches none; a role model is fetchable on demand and decodes; the 9,437,184-byte ceiling is raised only on a recorded measurement (D11).

### Claude's Discretion

- Shape of the client catalogue: extend `ships-client.json` (now two entries) with an explicit field list, or add a separate lazily loaded NPC catalogue. Must not hand-edit generated data and must respect Pitfall 20 (catalogue growth behind the content golden and drift gate).
- Lazy-loading granularity (per ship or per role), where files live, and how a test proves a cold start fetches none of them.
- Texture dedup between ships that share a model.

### Deferred Ideas (OUT OF SCOPE)

- Remaining role models (Anaconda, Boa, Asp, Ferdelance, Transporter, Worm, pirate variants): join with the populator in Phase 12 if needed.
- Sub-entity data (flashers, lasers): with NPC combat/flight phases.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-10 | Ship models and textures of the six populator roles compiled from the pinned Oolite snapshot with provenance in `ASSETS.md`/`NOTICE`, behind the drift gate | Ship set and per-ship asset costs (Standard Stack), converter extension points (Architecture), vendoring sequence and provenance rows (Pitfalls 1, 2, 6), drift gate behaviour (Pitfall 3) |
| DATA-11 (stage 1 only) | Fields the inert world uses taken from `shipdata.plist`: roles, AI name, scan class, model. The mass completes it in Phase 10 | NPC record shape, defaults, and worked examples (Architecture Pattern 3, Code Examples) |
| DATA-13 | NPC models and textures lazily loaded outside the first-load set; cold-start transfer under 9,437,184 bytes | Directory and naming decision, loader seam, e2e proof design (Architecture Pattern 4, Validation Architecture) |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

No `./CLAUDE.md` exists in the repository; `AGENTS.md` carries the project directives and has the same authority. [VERIFIED: Read of /home/opencode/git/wegolite/AGENTS.md via the task context]

- Everything runs in Docker. Host Node, npm and Playwright are not authoritative; a green host run is not evidence. Commands: `docker compose run --rm test`, `... test npx vitest run <file>`, `... e2e sh -lc "npm run build && npx playwright test <spec>"`, `... typecheck`, `... lint`, `... verify`.
- Scratch files live under `/tmp` (or the session scratchpad) and are mounted into containers; never add scratch files to the repository. Read-only reviewers do not modify tracked files.
- No database. Static client, IndexedDB saves. Nothing in this phase touches persistence.
- Licensing: project code GPL-2.0-or-later; Oolite-derived art and config stay CC BY-NC-SA 3.0. Never add an asset without recording its provenance in `NOTICE`/`ASSETS.md`.
- No OXP support.
- Generated data is never hand-edited (`src/content/generated/**`, `public/models/**`, `public/textures/**`). Regenerate with `docker compose run --rm assets`.
- Oolite reference checkout is `/home/opencode/git/oolite`; read upstream behaviour from it, consume data from the vendored copy `third_party/oolite/` and keep `CHECKSUMS.sha256` honest. Do not fetch Oolite files over the network (see Open Question 1 for the vendor script).
- Prefer `rg` over `grep`; use the codebase-memory index before wide reads.
- All documentation in English; add user-visible changes under `## [Unreleased]` in `CHANGELOG.md` in the same commit (internal-only changes may be omitted).
- Gate by change type: `src/sim`-only changes need `test`, `lint`, `typecheck`; browser-facing code (`src/render/`) needs `verify`; `verify-full` is the release gate and is also named for render, input, persistence and network-guard changes.
- Delegate mechanical work (ASSETS.md row generation, golden count updates, bookkeeping) to the cheapest model tier; keep design, content-pipeline and provenance judgement on the main model. Subagent briefs must carry the Docker-only block.
- User memory: scope to the technical minimum ("less but better"); skip `verify`/`verify-full` for pure-logic plans on this slow machine. [VERIFIED: MEMORY.md in the task context]

## Summary

The v1.0 content pipeline already does everything this phase needs for one ship; Phase 9 generalises it from three hand-wired GLBs to a table-driven set and adds one small compiled record file. A probe run in the project container shows that the existing `.dat` parser and `convertMesh` accept all ten candidate Oolite NPC meshes unchanged (no parse failure, no warning, 292 to 1509 triangles each; the Krait is the only one without a `NAMES` block and without explicit normals, and it still converts). All 38 candidate textures are 8-bit RGB or RGBA PNGs that the existing PNG decoder and emissive bake accept. All 48 candidate source files (10 models, 38 textures) have identical bytes at the pinned commit `7437f22` and in the Oolite checkout. No new npm package is needed. [VERIFIED: tsx probe and `git show 7437f22:` sha256 comparison run this session, see Sources]

The real costs are repository size and provenance bookkeeping, not code. The ten D-01 ships carry 44.7 MB of source PNG (38.0 MB without the Python) and encode to roughly 13.3 MB of WebP (11.1 MB without the Python) with the pipeline's own `cwebp 1.2.4` arguments. First load is unaffected as long as nothing fetches these files: Vite copies `public/` as-is and only referenced URLs are requested [CITED: vite.dev/guide/assets, publicDir]. The current cold-start measurement is 8,814,224 bytes against the 9,437,184 ceiling, so the phase must add zero fetches to the cold path; the loader code it adds is a few hundred bytes of entry chunk.

**Primary recommendation:** Keep the NPC GLBs and WebP textures flat in `public/models/` and `public/textures/` (so the writer, the drift gate roots and the drift test harness need no change), extend the existing explicit constants (`EMITTED_ENTRIES`, `MODEL_SOURCE_FILES`, `VENDORED_TEXTURES`, `MODEL_BOUNDS`), add one new generated file `src/content/generated/ships-npc.json` with six explicit fields per record behind a strict zod schema and a golden, add a lazy `loadNpcModel` to the asset cache that `preload()` never calls, and prove the cold-start claim with a network log in the existing first-load e2e test. Recommended ship set: nine models, D-01's list without the Python (see Standard Stack).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vendoring Oolite `.dat`/PNG bytes with checksums | Build tooling (`scripts/vendor-oolite.sh`) | Repository docs (`ASSETS.md`, `NOTICE`) | The script is the declared single authority for vendored bytes and provenance hashes [VERIFIED: scripts/vendor-oolite.sh header] |
| `.dat` to GLB, PNG to WebP, emissive bake | Build tooling (`tools/oolite-ingest`) | CDN / static files (`public/`) | Deterministic build-time compile; the browser only receives finished files |
| NPC record compile (`like_ship` resolution, field projection) | Build tooling | Client content layer (typed loader) | Resolution is already ported in `like-ship.ts`; the client only reads the result |
| Lazy fetch and decode of an NPC model | Browser / Client (`src/render/asset-cache.ts`) | CDN / static files | Fetch happens on demand through the existing `ModelLoader` seam; static hosting serves the bytes |
| First-load exclusion proof | Browser test (Playwright, Chromium) | Node test (path and source guards) | Only a real cold start shows what the browser requests |
| Provenance and drift enforcement | Test layer (`compliance-assets.test.ts`, `assets:check`) | Build tooling | Both gates already walk `third_party/` and `public/`; they must stay in step with new files |

## Standard Stack

No library is added. Everything below already exists in `package.json`. [VERIFIED: package.json]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| three | 0.187.0 | `GLTFLoader` (with `EXT_texture_webp`) already loads the existing GLBs | Existing runtime path; NPC GLBs use the same extension |
| zod | 4.6.7 | Strict schema for the new NPC record (`z.strictObject`) | Same pattern as `CatalogEntrySchema` |
| @gltf-transform/core | 4.5.1 | Independent GLB reader in tests (`NodeIO`) | Already used by `glb.test.ts` for "decodes" proof |
| vitest | 5.0.5 | Unit and golden tests | Project test framework |
| @playwright/test | 1.64.1 | Cold-start network log, on-demand fetch and WebP decode | Existing `budget.spec.ts` pattern |
| vite | 8.3.5 | `import.meta.glob` lazy chunk for the NPC record file; copies `public/` as-is | Existing `ships.ts` pattern [CITED: vite.dev/guide/features, glob import] |
| cwebp (Debian `webp`) | 1.2.4 | WebP encoder baked into the `wegolite-ci` image | Same encoder as every committed texture row [VERIFIED: `docker run wegolite-ci cwebp -version` printed `1.2.4`; texture-encodings.json encoder set is `cwebp 1.2.4`] |

### Recommended ship set (the "decisions to settle" for ship records)

The shipdata keys below are the non-template records; each resolves through `like_ship` to an `oolite_template_*` entry. The role tokens are verbatim from `shipdata.plist`, with the probability suffix that Oolite's `OORoleSet` reads (`name(probability)`, default 1.0). [VERIFIED: shipdata.plist:151-153 (adder), 3594-3596 (sidewinder), 3883-3886 (viper), 3538-3540 (shuttle), 2325-2327 (gecko); `OORoleSet.m:140` `probabilityForRole`]

Role coverage over the recommended nine (exact role strings the roadmap names; computed from the compiled catalogue `ships.json` [VERIFIED: node over src/content/generated/ships.json]):

| Role | Records carrying it in the set (token) |
|------|----------------------------------------|
| police | viper (`police`) |
| trader | adder (`trader(0.25)`), cobramk1 (`trader`), moray (`trader(0.5)`) |
| pirate | adder (`pirate(0.2)`), cobramk1 (`pirate(0.5)`), gecko (`pirate(0.5)`), krait (`pirate`), mamba (`pirate`), moray (`pirate(0.5)`), sidewinder (`pirate(0.75)`) |
| hunter | gecko (`hunter(0.75)`), krait (`hunter(0.5)`), mamba (`hunter`), sidewinder (`hunter`) |
| shuttle | adder (`shuttle`), shuttle (`shuttle`) |
| scavenger | adder (`scavenger`), cobramk1 (`scavenger`) |

Per-ship asset cost, measured in this session (PNG bytes from the Oolite checkout; WebP bytes from `cwebp 1.2.4` run in `wegolite-ci` with the exact argument profiles of `texture-encode.ts`: lossy `-q 90 -m 6 -sharp_yuv -noalpha`, normal `-near_lossless 60 -z 9 -noalpha`, specular `-q 90 -m 6 -sharp_yuv -exact -alpha_q 100`) [VERIFIED: scratchpad encode run]:

| Model (`.dat` bytes) | Source files | Source PNG bytes | WebP bytes | Tris | Mesh materials |
|----------------------|-------------:|-----------------:|-----------:|-----:|----------------|
| viper (102,213) | 2 | 595,138 | 126,134 | 699 | Engine, Hull |
| adder (100,123) | 3 | 4,269,287 | 694,830 | 694 | Hull |
| moray (138,274) | 5 | 3,230,781 | 903,690 | 930 | Engine, Hull |
| mamba (102,970) | 5 | 4,394,182 | 1,302,012 | 688 | Gun, Hull |
| krait (195,533) | 3 | 4,727,656 | 1,451,490 | 1509 | Hull |
| gecko (157,759) | 6 | 5,947,120 | 1,901,826 | 1032 | Gun, Hull |
| shuttle (43,985) | 3 | 3,448,171 | 1,054,318 | 292 | Hull |
| cobramk1 (105,855) | 3 | 5,108,694 | 1,558,432 | 731 | Hull |
| sidewinder (115,970) | 3 | 6,272,626 | 2,081,348 | 762 | Hull |
| **Nine-ship total** | **33 textures + 9 models** | **~38.0 MB** | **~11.1 MB** | | |
| python (139,250), optional | 5 | 6,741,637 | 2,255,286 | 916 | Engine, Gun, Hull |

Plus ten baked greyscale emissive PNGs (nine hull diffuse maps and `oolite_moray_subents.png`; about 0.4 MB) and nine GLBs (about 0.9 MB; the Cobra's 1,076-triangle GLB is 120,128 bytes, so size scales near 108 bytes per triangle). [VERIFIED: probe2 emissive bake sizes; public/models/cobra3.glb size]

**Owner decision (2026-11-13, in chat): nine models, Python left out. This is settled; the planner must not add it back.** (Original recommendation follows.)

**Recommendation: nine models, Python left out.** D-01 allows "Adder, Moray and/or Python"; Adder, Moray and Cobra Mk I already give three trader models, and the Python is the heaviest set (5 textures, 6.7 MB source, 2.3 MB WebP) for a role that is already covered. D-01 marks the Python optional, so the planner may add it back at the cost shown. The recommended set covers every one of the six roles with at least one model, and the four hunters and seven pirates need no further vendoring. The Cobra Mk III variants `cobra3-trader` and `cobra3-alternate` carry trader and pirate-class roles and reuse the already shipped Cobra textures (`cobra3-trader` materials point at `oolite_cobra3_*` files [VERIFIED: ships.json]); they need no new asset and are the first Phase 12 additions, but they point at `cobra3.glb`, which is a first-load file, so keep them out of the Phase 9 record set to keep "NPC set" equal to "lazy set".

**Records (D-02 decision):** one canonical record per model, nine records: `adder`, `cobramk1`, `gecko`, `krait`, `mamba`, `moray`, `shuttle`, `sidewinder`, `viper`. Reason: each carries the role strings above, the variants (`morayMED`, `mamba-escort`, `cobramk1-alt`, `viper-pursuit`, `adder-player`, `oolite-tutorial-krait`, `python-blackdog`) add only role tokens the first populator does not name (`sunskim-trader`, `escort`, `wingman`, `player`, tutorial roles). `cobramk1-alt` (`pirate(0.25)`) and `morayMED` (`trader(0.5)`) are the only variants with a populator-named role; both are skipped because the set is already deliberately not probability-faithful (D-01 chooses a small set and leaves out the other records that carry these roles, for example `anaconda`, `boa`, `ferdelance`, `python-trader`, `transporter`, `worm`), and adding them is a one-line change to the key list.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flat `public/models`, `public/textures` | A `public/npc/` subtree with its own texture directory | Crisper path-prefix test, but needs `encodeTextures`, `emitTextures` and `resolveReferencedTextures` parameterised by set, a third `EMITTED_ROOTS` entry (otherwise the drift gate silently skips byte comparison, see Pitfall 3) and the drift test harness copy list changed. Not worth it for the same proof |
| Separate `ships-npc.json` | Add NPC fields into `ships-client.json` | `ships-client.json` entries are byte-for-byte `CatalogEntry` copies of `ships.json` and `tests/content/ships-client.test.ts` asserts exactly that; mixing a second record shape breaks the contract and grows a file the first load imports |
| One `glb` field in the record | Derive the GLB path in the loader from `model` | A derived name needs one shared function in two worlds (tools and client); a compiled field is drift-gated and the loader has no naming logic |

**Installation:** none. `docker compose build` is not needed (no `package.json` change, so no `down --volumes` either).

**Version verification:** all versions above read from `package.json`; no package is added or changed. [VERIFIED: package.json]

## Package Legitimacy Audit

This phase installs no external package. The only new binary inputs are Oolite game data files, covered by the provenance sequence below, not by the npm gate. `cwebp` is already installed in the image (`Dockerfile`: `apt-get install -y --no-install-recommends webp`). [VERIFIED: Dockerfile]

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | - | - | - | - | - | No install |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 Oolite checkout @ 7437f22 (identical bytes, verified for 48 files)
        |  scripts/vendor-oolite.sh  (FILES list + ASSETS.md rows first)
        v
 third_party/oolite/{Models,Textures,Config}  +  CHECKSUMS.sha256  +  ASSETS.md rows
        |
        |  docker compose run --rm assets   (npm run assets:build)
        v
 generate.ts ──> compileShips (like_ship resolved, 194 entries)
        |            |
        |            ├─> emitShipsFromCatalogue / emitClientShips   (unchanged shape)
        |            └─> emitNpcShips  ──> src/content/generated/ships-npc.json   (NEW, 9 records, 6 fields)
        |
        ├─ readModels (MODEL_BOUNDS asserted) ──> emitModels (table-driven) ──> public/models/<base>.glb  (9 NEW)
        ├─ encodeTextures (VENDORED_TEXTURES) ───> public/textures/*.webp + texture-encodings.json
        ├─ emitTextures (alpha bake)  ───────────> public/textures/*_emissive.png
        └─ buildManifest ────────────────────────> manifest.json (every emitted path + sha256)

 assets:check = regenerate to a temp tree, compare file set + bytes + manifest hashes

 Runtime (nothing below runs on a cold start)
 ---------------------------------------------------------------
 first load:  index.html -> entry chunk -> preload() = cobra3 + coriolis + buoy only
 on demand :  loadNpcCatalogue()  (lazy ?raw chunk, ships-npc.json)
              loadNpcModel(glb)   (GLTFLoader via ModelLoader seam, memoised per glb path, disposed by AssetCache.dispose)
```

### Recommended Project Structure
```
tools/oolite-ingest/convert/
├── glb.ts            # EXTEND: NPC entries in EMITTED_ENTRIES / MODEL_SOURCE_FILES; generic buildShipGlb; emitModels loop
├── dat.ts            # EXTEND: MODEL_BOUNDS rows for the nine new .dat files
├── textures.ts       # EXTEND: VENDORED_TEXTURES (33 new names, code-unit sorted)
├── ships.ts          # CHANGE: VENDORED_MODEL_FILES derived from MODEL_SOURCE_FILES (single source)
├── npc-ships.ts      # NEW: compileNpcShips / emitNpcShips + NPC_SHIP_KEYS
└── npc-ships.test.ts # NEW
src/content/
├── schemas/ship-npc.ts   # NEW: NpcShipSchema (z.strictObject), NpcShipCatalogueSchema
├── ships-npc.ts          # NEW: lazy loader (import.meta.glob ?raw), same shape as ships.ts
├── types.ts              # EXTEND: export type { NpcShip } (type-only door for the sim)
└── generated/ships-npc.json   # GENERATED
src/render/asset-cache.ts      # EXTEND: loadNpcModel / dispose coverage; preload() untouched
public/models/*.glb, public/textures/*   # GENERATED, flat, same directories as v1
tests/golden/content/ships-npc.json      # NEW hand-written worked examples
tests/e2e/npc-assets.spec.ts             # NEW; plus an assertion added to budget.spec.ts cold-start test
```

The name `ships-npc` is deliberate: the sim ESLint zone already denies `**/content/ships*` with the message "src/sim must not import the ship catalogue" [VERIFIED: eslint.config.js:349-352], so a module and a generated file named `ships-npc*` inherit the denial and need no config edit. A name such as `npc-ships.ts` would be importable from `src/sim` until a new pattern is added.

### Pattern 1: Extend the explicit constants, never infer
**What:** The pipeline's contract is "explicit lists, both directions asserted". Adding a ship means adding it to each list; the existing closure checks fail the build if any list is out of step.
**Current values (verbatim):**
```ts
// tools/oolite-ingest/convert/glb.ts:79-100
export const EMITTED_ENTRIES: Readonly<Record<string, readonly string[]>> = {
  "buoy.glb": ["buoy", "oolite_buoy_subentity"],
  "cobra3.glb": ["cobra3-player"],
  "coriolis.glb": [ "coriolis-station", "oolite_coriolis_faceplate", "oolite_coriolis_tris", "oolite_coriolis_dock" ],
};
export const MODEL_SOURCE_FILES: Readonly<Record<string, readonly string[]>> = {
  "buoy.glb": ["oolite_buoy.dat", "oolite_buoy_subents.dat"],
  "cobra3.glb": ["oolite_cobra3.dat"],
  "coriolis.glb": [ "oolite_coriolis.dat", "oolite_coriolis_faceplate.dat", "oolite_coriolis_tris.dat", "oolite_coriolis_dock.dat" ],
};
```
[VERIFIED: tools/oolite-ingest/convert/glb.ts:79-100]

**Extension (one row per ship):** `"viper.glb": ["viper"]` in `EMITTED_ENTRIES`, `"viper.glb": ["oolite_viper.dat"]` in `MODEL_SOURCE_FILES`. The owning key is the non-template record named in the NPC key list. The GLB base name is the `.dat` name without the `oolite_` prefix and `.dat` suffix; it collides with none of `buoy`, `cobra3`, `coriolis`. A unit test must assert, for each NPC row, that the catalogue entry's resolved `model` equals the `MODEL_SOURCE_FILES` file and that the GLB base name follows the rule.

### Pattern 2: Generic single-mesh GLB builder
`buildCobraGlb` hard-codes the node name `"cobra3"` and mesh name `"oolite_cobra3"`:
```ts
// tools/oolite-ingest/convert/glb.ts:1046-1054
export function buildCobraGlb(mesh: ParsedMesh, entry: ShipEntry): Uint8Array {
  const built = buildNodeMesh("oolite_cobra3", mesh, entry);
  return writeGlb({
    nodes: [{ name: "cobra3", mesh: built }],
    materials: built.primitives.map((primitive) =>
      materialFor(primitive.materialName, entry.shipDef, entry.key),
    ),
  });
}
```
[VERIFIED: tools/oolite-ingest/convert/glb.ts:1046-1054]

Extract `buildShipGlb(nodeName, meshName, mesh, entry)` and make `buildCobraGlb` call it, so `cobra3.glb` stays byte-identical (the drift gate and `glb.test.ts` prove it). Then `emitModels` loops over the NPC rows. `materialFor` already handles a material with no specular map (Viper), an alpha-channel emission map (nine hulls), a bare illumination map and a `.png` key fallback.

Use of `buildNodeMesh` inherits two existing defences: `assertConvertedBounds` (the reflection check) and the `MESH_BOUNDS` check in `readModels`.

### Pattern 3: The NPC record (Claude's discretion, resolved)
Add a new generated file `src/content/generated/ships-npc.json`, emitted by `emitNpcShips(catalogue)` into the same `emitted` list as `emitClientShips`, so the manifest, drift gate and golden pick it up with no special case.

Record shape (strict, six fields, sorted by key in code-unit order, canonical JSON via the existing `canonicalJson`):

| Field | Meaning | Source in shipdata (after `like_ship`) | Default when absent |
|-------|---------|----------------------------------------|---------------------|
| `key` | shipdata key | the catalogue key | none |
| `roles` | every authored role token, verbatim, including `(probability)` suffixes | `roles` (already projected to `string[]`) | none (a record without roles is a build error) |
| `aiType` | AI name | `ai_type` | `"nullAI.plist"` [VERIFIED: ShipEntity.m:564 `[shipDict oo_stringForKey:@"ai_type" defaultValue:@"nullAI.plist"]`] |
| `scanClass` | scan class constant name | `scan_class` (alias `scanClass` already collapsed by `like-ship.ts`) | `"CLASS_NEUTRAL"` [VERIFIED: ShipEntity.m:520, 2126-2128: a ship whose `scanClass == CLASS_NOT_SET` is forced to `CLASS_NEUTRAL`] |
| `model` | authored `.dat` file name | `model` | none |
| `glb` | the `public/`-relative GLB URL path, e.g. `models/viper.glb` | derived by the shared naming rule | none |

`roles` stays verbatim so it equals `ships.json` and carries no interpretation; Phase 12 parses `name(probability)` when it needs weights (Oolite omits the suffix when the probability is 1.0 [VERIFIED: OORoleSet.m:123-130 `if (probability != 1.0f)`]; `probabilityForRole` is OORoleSet.m:140). `glb` is the one field beyond D-06's list; it is a locator, not inert-world data, and exists so that DATA-13's "fetchable on demand" has one drift-gated source of truth. Do not add stats, subentities, materials, `auto_ai` or weapons (DATA-15 deferred, D-04).

**Scan class caveat the planner must carry:** 119 of the 194 catalogue entries have no `scan_class` [VERIFIED: ships.json distribution], and only the Viper of the nine has one (`CLASS_POLICE`, shipdata.plist:3886). So eight of nine records compile to the engine default `CLASS_NEUTRAL`, not an authored value. The worked examples must pin this (the Adder is the natural pin), and the emitter comment must cite ShipEntity.m:2126. Role-based spawning also overwrites it for police (`Universe.m` `newShipWithRole`: `if ([role isEqualToString:@"police"]) [ship setScanClass:CLASS_POLICE];`); that is Phase 12 behaviour and is not compiled.

**AI name caveat:** the compiled name is the authored `ai_type` (Adder: `oolite-scavengerAI.js`, though its first role is trader). Oolite replaces it at spawn with `autoAImap.plist[role]` when `auto_ai` is true (default YES) [VERIFIED: Universe.m `newShipWithRole`, `defaultAIForRole`]. `autoAImap.plist` is already vendored. Whether Phase 12 needs a compiled role-to-AI map is a Phase 12 question; Phase 9 compiles exactly the D-06 fields.

### Pattern 4: Lazy loading and the cold-start proof (Claude's discretion, resolved)
- **Granularity:** per GLB (model), memoised by `glb` path. A role is not a loading unit: a role maps to several ships and ships share models. Which key a role picks is Phase 12.
- **Location:** flat `public/models/` and `public/textures/`. NPC GLB image URIs are `../textures/<file>`, which resolves correctly from `public/models/<name>.glb` with no writer change. [VERIFIED: glb.ts `TEXTURE_URI_PREFIX = "../textures/"` and its header comment]
- **Texture dedup:** automatic by file name. The encoded file is `<source basename>.webp`; two GLBs that reference one source share one file. No NPC texture is shared with the Cobra, Coriolis or buoy (all names are `oolite_<ship>_*`), and no two chosen models share a texture, so nothing needs deduplicating now.
- **Runtime API:** add to `createAssetCache`: `loadNpcModel(glb: string): Promise<GLTF>` (memoised per path in a `Map`, errors wrapped like `load()`), `npcModel(glb): GLTF` (throws before load, like `cobra()`), and extend `dispose()` to free NPC models exactly once. Do not touch `preload()`, `loaded()` or the three `*Promise` fields. Unit-test it with the injected `ModelLoader` (pattern of `tests/app/dispose.test.ts`). The loader is dead code until Phase 12 consumes it; it is included because DATA-13 says "lazily loaded" and because the dispose-leak bug class (cache owner must free what it caches) is cheaper to settle now than under populator pressure. If the owner wants the absolute minimum, the fallback is files-only plus the e2e fetch-and-decode test, and Phase 12 adds the loader.
- **Catalogue loader:** `src/content/ships-npc.ts` copies the shape of `src/content/ships.ts` (a non-eager `import.meta.glob("./generated/ships-npc.json", { query: "?raw", import: "default" })`, cached promise, `JSON.parse`, `Array.isArray` check). Vite splits a non-eager glob into a separate chunk fetched only when called. [CITED: vite.dev/guide/features, "Glob Import": "Matched files are by default lazy-loaded via dynamic import and will be split into separate chunks during build"] It is covered by the `src/content/**` coverage floor (66% lines), so it needs a test.

### Anti-Patterns to Avoid
- **Hand-editing a generated file or an `ASSETS.md` hash cell for a vendored path.** The vendor script rewrites vendored hashes; public hashes come from `manifest.json`. Never type a digest.
- **Adding a `public/` subtree** without adding it to `EMITTED_ROOTS` in `cli.ts` and to the drift test copy list (Pitfall 3).
- **Preloading an NPC asset** in `preload()`, `warm-up`, a `<link rel="preload">` or `index.html`. That is the only way to break DATA-13.
- **Compiling combat or flight fields** (`max_flight_speed`, `thrust`, `energy`, `weapon_*`, `missiles`, `likely_cargo`, `bounty`, `escorts`) into the NPC record. DATA-15 is deferred. (`ships.json` already carries them in `extras`; that file is the compiler's complete output, not the NPC record.)
- **Keying the NPC set off `usable`.** `usable` is true for 102 entries; the NPC set is an explicit key list.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `like_ship` resolution and override merge | A new resolver for NPC records | `compileShips` / `resolveAll` output (`CatalogEntry.shipDef.roles`, `.extras.ai_type`, `.extras.scan_class`) | Already ported from `OOShipRegistry.m`, alias pairs collapsed (`scan_class`/`scanClass`) [VERIFIED: like-ship.ts header] |
| `.dat` parsing, winding repair, GLB writing | A second mesh path for NPCs | `parseDat`, `convertMesh`, `writeGlb`, `materialFor` | Handles NAMES-less meshes (Krait), explicit and per-face normals, emission maps; probe converted all ten meshes cleanly |
| WebP encoding and reproducibility | A new encode step or tool | `encodeTextures` + `texture-encodings.json` | Reuses committed outputs when source SHA, arguments and output hash still match; the gate proves provenance of each byte |
| Emissive bake | Reading diffuse alpha elsewhere | `emitTextures` / `bakeEmissive` | Same naming rule as `materialFor` (`emissiveFile`) |
| Provenance hash cells | Typing SHA-256 values | `vendor-oolite.sh` (vendored rows), `manifest.json` (public rows) | The script is the single authority; the compliance test compares every cell to disk |
| Cold-start byte counting | A new transfer meter | The `requestfinished` + `sizes().responseBodySize` pattern in `budget.spec.ts` | Same measure as the recorded 8,814,224 baseline |
| Canonical JSON | `JSON.stringify` with indentation | `canonicalJson` from `tools/oolite-ingest/canonical/json.ts` | Byte-stable output is what `assets:check` compares |

**Key insight:** this phase is table extension plus bookkeeping. Every piece of logic that could be wrong (parsing, winding, resolution, encoding, drift) already has a proof; the risk is a missed list entry or a missed provenance row, and the existing both-direction assertions turn those into build failures.

## Runtime State Inventory

Not applicable. This is an additive content phase, not a rename, refactor or migration. No stored data, service configuration, OS registration, secret or installed artifact carries a name that changes. Nothing in IndexedDB saves changes (SAVE-08 is Phase 11). Stated explicitly: stored data none, live service config none, OS-registered state none, secrets/env none, build artifacts none (the `wegolite-ci` image gains no dependency).

## Common Pitfalls

### Pitfall 1: Vendor script order and the missing-row failure
**What goes wrong:** `vendor-oolite.sh` downloads everything, then aborts with `no ASSETS.md row for: ...` if any vendored path lacks a row, after already writing `CHECKSUMS.sha256` and `pin.json`. [VERIFIED: scripts/vendor-oolite.sh, the `missing` check before the row rewrite]
**Why it happens:** the rows are a precondition, not an output.
**How to avoid:** order the steps: (1) append the 42 paths (9 `.dat`, 33 `.png`) to `FILES`; (2) add 42 `ASSETS.md` rows for `third_party/oolite/...` with placeholder hash cells and the standard provenance cells (copy the existing `vendored-input` row: origin `Oolite 1.93.1-241 @ 7437f22`, URL `https://raw.githubusercontent.com/OoliteProject/oolite/7437f22/Resources/<path>`, author `Oolite contributors`, licence `CC BY-NC-SA 3.0`, modifications `none`); (3) run the script; (4) run `assets:build`; (5) add the `public/` rows using hashes from `manifest.json`; (6) `docker compose run --rm lint npx prettier --write ASSETS.md` (Prettier pads every cell [VERIFIED: vendor script comment]); (7) re-run `compliance-assets.test.ts`.
**Warning signs:** `compliance-assets.test.ts` reports `N ASSETS.md rows` for a path or a hash mismatch.

### Pitfall 2: Provenance row volume
**What goes wrong:** 94 new `ASSETS.md` rows (42 vendored plus 52 generated: 9 GLB, 33 WebP, 10 emissive PNG) and 42 `CHECKSUMS.sha256` lines; the compliance tests require exactly one row per file under both `third_party/oolite/` and `public/`, and a non-empty licence cell on every `public/` row. [VERIFIED: tests/compliance-assets.test.ts]
**How to avoid:** generate the rows from `manifest.json` with a throwaway script under `/tmp` mounted into the container; this is mechanical work to delegate to the cheapest model tier with the Docker block. The `NOTICE` prose (section 3) names the three current GLBs and `src/content/generated/dock-port.json`; update it to name the new GLBs and `src/content/generated/ships-npc.json` (a derivative of `shipdata.plist`, CC BY-NC-SA 3.0, same wording as the dock-port paragraph). `tests/compliance.test.ts` pins fixed `NOTICE` phrases only, so wording additions are safe.

### Pitfall 3: A new emitted directory escapes the drift gate
**What goes wrong:** `compareTrees` lists committed and regenerated files only under `EMITTED_ROOTS` (`GENERATED_DIR`, `EMITTED_MODELS_DIR`, `EMITTED_TEXTURES_DIR`); a file outside them is never byte-compared against its regeneration and is never reported as `EXTRA`. [VERIFIED: tools/oolite-ingest/cli.ts:143-211] `drift.test.ts` also copies exactly `public/models` and `public/textures` into its temp tree. [VERIFIED: drift.test.ts withTempTree]
**How to avoid:** stay inside the three existing roots (this research's decision). If a later plan adds a root, add it to `EMITTED_ROOTS` and to the `withTempTree` copy list in the same change.

### Pitfall 4: `modelVendored` and golden churn
**What goes wrong:** `VENDORED_MODEL_FILES` is a separate five-file list (`oolite_cobra3.dat` and the four Coriolis files), so `modelVendored` is false for the buoy and would stay false for every new NPC record. [VERIFIED: ships.ts:50-56] Changing it changes `ships.json` (194 entries), `tests/golden/content/ships.json` (`vendoredModelEntries`), the "exactly seven" assertion and its count in `tools/oolite-ingest/convert/ships.test.ts`. `modelVendored` has no runtime reader; only tests read it. [VERIFIED: rg modelVendored src tests tools]
**How to avoid:** derive `VENDORED_MODEL_FILES` from the union of every `MODEL_SOURCE_FILES` list (one source of truth). That also corrects the buoy omission. Regenerate, read the `ships.json` diff, and update the golden list and the count assertion in the same plan, with the reason in the commit. `ships-client.json` entries (`coriolis-station`, `oolite_template_cobra3-player`) keep `modelVendored: true` and are unchanged, so `tests/content/ships-client.test.ts` stays green.

### Pitfall 5: Hard-coded counts in texture tests
**What goes wrong:** `textures.test.ts:77-82` asserts "exactly the 21 allowlisted names" and `references.size` equal to 21; `texture-encode.test.ts` and `compliance-assets.test.ts` (`>= 23` public files vacuity guard, `>= 60` vendored) are parameterised over `VENDORED_TEXTURES`. [VERIFIED: rg over the test files]
**How to avoid:** the parameterised tests extend to the new textures automatically (this is a benefit: near-lossless error bound, alpha and lossy-profile checks now cover them). Update the literal 21 to 54 (21 + 33) in the same plan, and update the doc comment ("The 16 source files").

### Pitfall 6: Vendor script network vs the Oolite-checkout rule
**What goes wrong:** the script fetches every file with `fetch("https://raw.githubusercontent.com/...")`, while `AGENTS.md` says not to fetch Oolite files over the network. [VERIFIED: scripts/vendor-oolite.sh; AGENTS.md]
**How to avoid:** see Open Question 1. Whichever route is chosen, verify the result against the checkout: all 48 files are byte-identical between `git show 7437f22:Resources/<path>` and the checkout, so a post-vendor comparison of `CHECKSUMS.sha256` lines with `sha256sum` of the checkout files is a sufficient offline cross-check.

### Pitfall 7: First-load regression through a side door
**What goes wrong:** anything that references an NPC URL on the cold path breaks the 623,000-byte headroom immediately (the smallest NPC set, the Viper, is 126 KB of WebP; the nine-ship set is 11 MB).
**How to avoid:** the e2e proof (below) logs every request on the cold start and fails if any NPC GLB or any texture file referenced by an NPC GLB appears. Do not call `loadNpcCatalogue()` or `loadNpcModel()` from any boot, title, docked or flight path in this phase.

### Pitfall 8: Python-only texture oddities (if the Python is added back)
The Python hull uses `oolite_python_blackdog_normal.png` as its normal map and the `Gun` material has no emission. [VERIFIED: ships.json materials for key `python`] It is an authored quirk, not an error; the closure resolves it. Two of its PNGs are colour type 2 (RGB), which the decoder accepts. [VERIFIED: probe2]

### Pitfall 9: A mesh material absent from the shipdata material set (or the reverse)
`resolveReferencedTextures` walks every material in the owning shipdata entry, whether or not the mesh uses it, while `convertMesh` emits a primitive per mesh material. For all nine models the two sets agree (the mesh `NAMES` blocks and the shipdata `materials` keys are the same; the Krait mesh has no `NAMES`, so its material name comes from the `TEXTURES` token `Hull`). [VERIFIED: probe.ts material names; ships.json material keys] A future model whose material sets differ would either fail `materialFor` (a primitive with no material config) or add an unreferenced texture to the closure; keep the closure tests.

## Code Examples

### Table-driven additions (the exact existing style)
```ts
// tools/oolite-ingest/convert/dat.ts: MODEL_BOUNDS rows (spans measured with parseDat + boundingBox on the checkout)
"oolite_adder.dat": { x: 28.0186, y: 14.8953, z: 51.1851 },
"oolite_cobramk1.dat": { x: 70, y: 17.7438, z: 66.9039 },
"oolite_gecko.dat": { x: 61.4758, y: 14.6341, z: 51.2832 },
"oolite_krait.dat": { x: 94.4076, y: 21.7931, z: 82.815 },
"oolite_mamba.dat": { x: 63.5724, y: 15.5016, z: 67.1162 },
"oolite_moray.dat": { x: 59.3566, y: 28.7094, z: 69.7014 },
"oolite_shuttle.dat": { x: 23.148, y: 19.6538, z: 39.41 },
"oolite_sidewinder.dat": { x: 63.2292, y: 14.4243, z: 44.431 },
"oolite_viper.dat": { x: 50, y: 18.1363, z: 65.1994 },
```
Source: tsx probe over the Oolite checkout in `wegolite-ci`; the existing rows are the same kind of value (`"oolite_cobra3.dat": { x: 130, y: 34.9649, z: 81.3726 }`, [VERIFIED: dat.ts:118-126]) and `assertBounds` allows 1e-3 relative tolerance, so these four-decimal spans are accurate. Re-measure through `readModels` once the files are vendored; a mismatch fails as `MESH_BOUNDS`. [VERIFIED: probe output this session]

### The NPC key list and the emitter skeleton
```ts
// tools/oolite-ingest/convert/npc-ships.ts (sketch; follow emitClientShips for structure and error style)
export const NPC_SHIP_KEYS: readonly string[] = [
  "adder", "cobramk1", "gecko", "krait", "mamba",
  "moray", "shuttle", "sidewinder", "viper",
]; // code-unit sorted, like CLIENT_SHIP_KEYS

export function glbPathFor(model: string): string {
  // oolite_viper.dat -> models/viper.glb
  const base = model.replace(/^oolite_/, "").replace(/\.dat$/, "");
  return `models/${base}.glb`;
}

export function compileNpcShips(catalogue: ShipCatalogue): NpcShip[] {
  return NPC_SHIP_KEYS.map((key) => {
    const entry = catalogue.entries.find((candidate) => candidate.key === key);
    if (entry === undefined) throw new Error(`Wegolite: the compiled ship catalogue has no "${key}" entry for ${NPC_SHIPS_PATH}.`);
    if (entry.roles === null || entry.model === null) throw new Error(`Wegolite: "${key}" has no roles or no model.`);
    const aiType = entry.extras["ai_type"];
    const scanClass = entry.extras["scan_class"];
    return {
      key,
      roles: entry.roles,
      aiType: typeof aiType === "string" ? aiType : "nullAI.plist",
      scanClass: typeof scanClass === "string" ? scanClass : "CLASS_NEUTRAL", // ShipEntity.m:2126
      model: entry.model,
      glb: glbPathFor(entry.model),
    };
  });
}
```
The emitter validates each record with `NpcShipSchema.parse` before `canonicalJson`, as `projectEntry` does for `CatalogEntrySchema`. [VERIFIED: ships.ts:417 `CatalogEntrySchema.safeParse(candidate)` pattern]

### Strict schema
```ts
// src/content/schemas/ship-npc.ts
export const NpcShipSchema = z.strictObject({
  key: z.string(),
  roles: z.array(z.string()).min(1),
  aiType: z.string(),
  scanClass: z.string(),
  model: z.string(),
  glb: z.string(),
});
export const NpcShipCatalogueSchema = z.array(NpcShipSchema);
export type NpcShip = z.infer<typeof NpcShipSchema>;
```
Export `NpcShip` from `src/content/types.ts` as `export type { ... }` only (that file's contract is type-only [VERIFIED: types.ts header]).

### Worked examples to pin (hand-written golden; values verified against the plist)
| Key | roles (verbatim tokens) | aiType | scanClass | model |
|-----|-------------------------|--------|-----------|-------|
| viper | `police` | `oolite-policeAI.js` | `CLASS_POLICE` (authored, shipdata.plist:3886) | `oolite_viper.dat` |
| adder | `trader(0.25)`, `trader-courier(0.5)`, `trader-smuggler`, `pirate-light-fighter(0.25)`, `pirate(0.2)`, `scavenger`, `shuttle`, `hermit-ship` | `oolite-scavengerAI.js` | `CLASS_NEUTRAL` (default) | `oolite_adder.dat` |
| sidewinder | `pirate(0.75)`, `pirate-light-fighter(0.25)`, `hunter` | `oolite-pirateAI.js` | `CLASS_NEUTRAL` (default) | `oolite_sidewinder.dat` |
| shuttle | `shuttle` | `oolite-shuttleAI.js` | `CLASS_NEUTRAL` (default) | `oolite_shuttle.dat` |
| gecko | `hunter(0.75)`, `pirate-light-fighter(0.5)`, `pirate-medium-fighter(0.75)`, `pirate(0.5)`, `escort(0.25)`, `escort-medium(0.5)`, `escort-heavy` | `oolite-pirateAI.js` | `CLASS_NEUTRAL` (default) | `oolite_gecko.dat` |

[VERIFIED: shipdata.plist lines read this session: 50, 151-153 (adder); 3562, 3594-3596 (sidewinder); 3503, 3538-3540 (shuttle); 2325-2327 (gecko); 3834, 3883-3886 (viper). The `oolite_template_*` plist entries are the resolved parents; the keys `adder`, `viper`, `gecko`, `shuttle`, `sidewinder` each `like_ship` their template (shipdata.plist:4260-4263, 4426-4428, 4501-4508, 4537-4540).] The Viper also pins that the field set carries no stats: assert the record's key set equals the six names exactly.

### Lazy loader (asset-cache extension skeleton)
```ts
// inside createAssetCache; the Map is the only new state
const npcPromises = new Map<string, Promise<GLTF>>();
const npcModels = new Map<string, GLTF>();
function loadNpcModel(glb: string): Promise<GLTF> {
  let pending = npcPromises.get(glb);
  if (pending === undefined) {
    pending = load(glb).then((gltf) => { npcModels.set(glb, gltf); return gltf; });
    npcPromises.set(glb, pending);
  }
  return pending;
}
// dispose(): add [...npcModels.values()] to the `for (const model of [...])` list, then npcModels.clear(), npcPromises.clear()
```
`load` already prefixes `baseUrl` and wraps failures in a path-named error. [VERIFIED: asset-cache.ts `load`] The existing paths are `models/cobra3.glb`, `models/coriolis.glb`, `models/buoy.glb`, and `preload()` calls exactly those three. [VERIFIED: asset-cache.ts:28-30, 109-113]

### Cold-start proof (extend the existing first-load test)
Add to the `budget.spec.ts` cold-start test a `page.on("request", ...)` list, and compute the NPC set in Node from the repository: read `src/content/generated/ships-npc.json`, take each `glb`, read the GLB JSON chunk from `public/`, resolve each `images[].uri` against the GLB URL. Assert that no collected request URL path equals any NPC GLB or NPC texture path, in addition to the existing ceiling assertion. The same measured `total` stays the single recorded number. [VERIFIED: budget.spec.ts cold-start test structure; `FIRST_LOAD_BYTES_CEILING = 9 * MIB`, MIB = 1_048_576]

A new `tests/e2e/npc-assets.spec.ts` covers "fetched on demand and decodes" (cheap, no app hook needed): in `page.evaluate`, for every NPC record fetch its `glb`, check the GLB magic `0x46546c67` and version 2, parse the JSON chunk, fetch each `images[].uri`, and call `createImageBitmap(blob)` on each WebP and PNG (a decode in the real browser). Geometry and material correctness is proved at build time by `NodeIO` in a vitest test. `GLTFLoader` is not used in the page because the built bundle does not expose three's addon as a URL-importable module (the reason `models.spec.ts` gives for the same limitation). [VERIFIED: models.spec.ts header comment]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Ship PNG textures copied byte-for-byte (19.7 MB for 16 files) | `cwebp` re-encode with a committed record (`texture-encodings.json`) | quick task 261110-b7w, 2026-11-10 | NPC textures use the same path: about 30% of PNG size |
| 194-entry `ships.json` imported by the client (706 KB) | `ships-client.json` with two entries (15,196 bytes) | quick task 261109-s8k, 2026-11-09 | The NPC file must stay a separate lazy chunk; do not grow `ships-client.json` |
| Per-model hand-written GLB builders | Table-driven for single-mesh NPC ships; hand-written builders stay for the Coriolis and buoy composites | this phase | New ships are a table row |

**Deprecated/outdated:** the comment "The 16 source files" and the "five models" comments in `textures.ts` and `ships.ts`, and the roadmap line "about 37 more models" (now a deferred DATA-14 estimate). Update them when touching the files.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Cold-start bytes will stay at 8,814,224 (plus a few hundred bytes of entry chunk) because nothing on the cold path fetches an NPC file | Summary, Pitfall 7 | Low: the e2e measurement in this phase replaces the assumption; if the entry chunk grows more than expected, the ceiling logic (D11) applies |
| A2 | Prettier will keep the existing `ASSETS.md` column widths when 94 rows are added (new paths are not longer than the longest existing one, `public/textures/oolite_coriolis_faceplate_diffuse_emissive.png`) | Pitfall 1 | Low: `prettier --write` reflows the table; only diff noise |
| A3 | The committed WebP files will be the same bytes as the scratch encode, because the pipeline passes the same arguments | Standard Stack cost table | Low: sizes are estimates for planning; the committed numbers come from `assets:build` |
| A4 | `verify` (fast gate) is sufficient at the end of the phase; `verify-full` is not needed because the only render-code change is an additive method not exercised at runtime | Validation Architecture | Medium: AGENTS.md names render changes as a `verify-full` trigger; the owner's slow-machine gate policy is a recorded preference, so confirm with the owner |
| A5 | Dropping the Python (D-01 "and/or") is acceptable | Standard Stack | Low: reversible; adding it back is one row per list plus 5 textures |
| A6 | The scan class `CLASS_NEUTRAL` default belongs in the compiled record rather than leaving the field absent | Pattern 3 | Low-medium: a different reading (absent field, populator applies the default) changes the golden and Phase 12's code but not Phase 9's pipeline |

## Open Questions

1. **How may the vendor script obtain the 42 files given AGENTS.md's "do not fetch over the network"?**
   - What we know: `scripts/vendor-oolite.sh` is documented as the only sanctioned way bytes enter `third_party/oolite/` and it downloads each file from `raw.githubusercontent.com` at the pinned commit. It has "no --force, no allowlist and no environment-variable escape". All 48 required files are byte-identical in the Oolite checkout at `7437f22` and at checkout HEAD. [VERIFIED: sha256 comparison this session]
   - What's unclear: whether the rule against network fetches was meant to cover the vendor script.
   - Recommendation: run the sanctioned script through `docker compose run --rm assets sh scripts/vendor-oolite.sh` (it re-downloads all 75 existing files too and rewrites the same bytes), then cross-check `CHECKSUMS.sha256` against the checkout. Raise it as a `checkpoint:human-verify` in the vendoring plan. Do not add an offline escape to the script without an owner decision.
2. **Python or not?** RESOLVED by the owner on 2026-11-13: no Python; nine models.
3. **Does Phase 12 need `auto_ai` and the role-to-AI map in the record?** Out of scope by D-06; recorded so Phase 12 planning does not assume the compiled `aiType` is the effective spawn AI.
4. **Should the buoy models join `VENDORED_MODEL_FILES`?** The recommended derivation does it implicitly (it is the single-source fix). If the planner keeps the five-file list, the golden changes less but `modelVendored` stays inconsistent with the vendored buoy files.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker + Compose | every command | yes | Compose 5.6.0 | none (AGENTS.md mandates Docker) |
| `wegolite-ci` image (Node 24, cwebp) | `assets:build`, tests, e2e | yes | Node v24.22.2, cwebp 1.2.4 | `docker compose build` |
| Oolite checkout | verification of vendored bytes | yes | commit `4bb1f53dea8` HEAD; pinned `7437f22` present | none needed |
| Network access from the `assets` container | `vendor-oolite.sh` only | not checked | - | see Open Question 1 |
| Host `cwebp` | not required | no | - | the container has it |

**Missing dependencies with no fallback:** none for planning. Network for the vendor script is the one item to confirm at execution time.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.5 (unit project, Node environment) and Playwright 1.64.1 (Chromium) |
| Config file | `vitest.config.ts` (include `src/**/*.test.ts`, `tests/**/*.test.ts`, tools tests), `playwright.config.ts` |
| Quick run command | `docker compose run --rm test npx vitest run tools/oolite-ingest tests/content tests/compliance-assets.test.ts tests/compliance.test.ts` |
| Full suite command | `docker compose run --rm test` (includes the `src/content/**` coverage floors) |
| Content gate | `docker compose run --rm assets npm run assets:check` |
| Browser | `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/budget.spec.ts tests/e2e/npc-assets.spec.ts"` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-10 | Nine GLBs emitted, each parses with the independent reader, node/material/image counts match, every triangle fronts its converted normal, bounds match `MODEL_BOUNDS` | unit | `... vitest run tools/oolite-ingest/convert/glb.test.ts` (extend with a table-driven NPC block) | extend (Wave 0) |
| DATA-10 | Texture closure holds in both directions for 54 names; every new `.webp` meets its profile (near-lossless bound, specular alpha, lossy no-alpha); emissive set equals the GLB `images[].uri` set | unit | `... vitest run tools/oolite-ingest/convert/textures.test.ts tools/oolite-ingest/convert/texture-encode.test.ts` | exists, update the literal 21 |
| DATA-10 | Every vendored and public file has one `ASSETS.md` row with the right hash; `CHECKSUMS.sha256` agrees | unit | `... vitest run tests/compliance-assets.test.ts` | exists, no change needed |
| DATA-10 | Drift gate: no `MISSING`/`EXTRA`/`CHANGED` on a clean tree; regenerated NPC GLB is byte-identical | content gate | `... assets npm run assets:check` and `drift.test.ts` | exists |
| DATA-10 | No forbidden asset class: the NPC key list carries no role in `cargopod`, `missile`, `escape-capsule`, `wreckage`, `asteroid`, no audio file under `public/` or `third_party/oolite/` | unit | new case in `npc-ships.test.ts` | Wave 0 |
| DATA-11 stage 1 | Compiled records equal the hand-written golden for the five worked examples; every record's key set is exactly the six fields; no stats | unit/golden | `... vitest run tools/oolite-ingest/convert/npc-ships.test.ts tests/content/ships-npc.test.ts` | Wave 0 |
| DATA-11 stage 1 | `like_ship` is resolved: each record's roles, AI and model come from the resolved parent, not the child stub | unit | same file (compare with `compileShips` entries) | Wave 0 |
| DATA-13 | Cold start requests no NPC GLB and no NPC texture; transfer under 9,437,184 | e2e | `budget.spec.ts` cold-start test (extend) | extend |
| DATA-13 | Each NPC GLB is fetchable from the preview and each referenced image decodes in the browser | e2e | `tests/e2e/npc-assets.spec.ts` | Wave 0 |
| DATA-13 | `preload()` requests exactly three URLs; `loadNpcModel` requests only its path, memoises, wraps errors with the path, and `dispose()` frees NPC resources once | unit | `... vitest run tests/app/asset-cache-npc.test.ts` (injected `ModelLoader`) | Wave 0 |
| DATA-13 | NPC catalogue loader parses the lazy chunk; `src/content/ships-npc.ts` does not import `ships.json` or `ships-client.json` | unit | `... vitest run tests/content/ships-npc.test.ts` | Wave 0 |
| (guard) | `src/sim` cannot import `content/ships-npc` (existing `**/content/ships*` denial) | lint guard | add a probe case beside the ships probe in `tests/guards/content-boundary.test.ts` (optional) | extend |

### Sampling Rate
- **Per task commit:** the quick run command above (tools, content and compliance tests); `docker compose run --rm lint` and `typecheck` for any TypeScript task.
- **Per wave merge:** `docker compose run --rm test` and `docker compose run --rm assets npm run assets:check`.
- **Phase gate:** `docker compose run --rm verify` once at the end (it runs lint, typecheck, `assets:check`, the full test run, the build and the e2e smoke subset); then the targeted `budget.spec.ts` and `npc-assets.spec.ts` run. Record the measured cold-start bytes in `docs/PERFORMANCE.md` (unchanged ceiling; a raise needs a recorded decision, D11). `verify-full` only if the owner asks (see A4).

### Wave 0 Gaps
- [ ] `tools/oolite-ingest/convert/npc-ships.test.ts` covers DATA-10 (forbidden classes), DATA-11 (golden, field set, `like_ship`)
- [ ] `tests/golden/content/ships-npc.json` hand-written worked examples (never generated)
- [ ] `tests/content/ships-npc.test.ts` loader and boundary
- [ ] `tests/app/asset-cache-npc.test.ts` lazy load and dispose with the injected loader
- [ ] `tests/e2e/npc-assets.spec.ts` on-demand fetch and WebP/PNG decode
- [ ] Extend `glb.test.ts` with a table-driven block over the nine NPC GLBs (reuse `readWithReader`, `readChunks`)
- [ ] Update `ships.test.ts` count assertions and the `tests/golden/content/ships.json` vendored list after the `VENDORED_MODEL_FILES` change; update `textures.test.ts` literal 21
- No framework install is needed.

## Security Domain

`security_enforcement` is enabled in `.planning/config.json` (ASVS level 1, block on high). [VERIFIED: config.json]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | none (no auth surface) |
| V3 Session Management | no | none |
| V4 Access Control | no | static files, no per-user data |
| V5 Input Validation | yes | `assertModelInsideModels` rejects a `model` value that escapes `third_party/oolite/Models`; `resolveSnapshotFile` and `resolveUnder` guard every read and write path; `MAX_MESH_COUNT` and `MAX_TEXTURE_DIMENSION` bound parsing; the NPC record is validated by a strict zod schema before write |
| V6 Cryptography | no | SHA-256 for provenance only, via `node:crypto` through `sha256Hex` (never hand-rolled) |
| V10 Malicious code / V14 Config | yes | no new dependency; vendored bytes pinned to a commit and hashed; CSP stays `default-src 'self'; connect-src 'self'` (same-origin GLB and WebP fetches, no new origin) [CITED: PITFALLS.md Pitfall 13(h) states the CSP] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal through a `model` or texture name from a plist | Tampering | Existing resolvers refuse paths outside `third_party/oolite/Models` and `.../Textures`; the NPC emitter uses a fixed key list and a pure naming function, never a plist value as a path component without the model-path check |
| Tampered vendored bytes (supply chain) | Tampering | Pinned commit, `CHECKSUMS.sha256`, `ASSETS.md` hashes, `compliance-assets.test.ts`, drift gate |
| Oversized or malformed mesh or PNG (decompression cost) | Denial of service | Existing limits (`MAX_MESH_COUNT = 200_000`, `MAX_TEXTURE_DIMENSION = 8192`, 16-bit PNG rejected); the largest candidate is 1024x1024 and 1509 triangles |
| Licence violation by an unrecorded asset | Repudiation (compliance) | One row per file in `ASSETS.md` is enforced by test; `NOTICE` updated |

## Sources

### Primary (HIGH confidence)
- Repository files read this session: `AGENTS.md`, `.planning/phases/09-npc-content/09-CONTEXT.md`, `.planning/ROADMAP.md` (Phase 9), `.planning/REQUIREMENTS.md` (DATA-10/11/13), `.planning/research/PITFALLS.md` (12, 20, 29), `package.json`, `Dockerfile`, `compose.yaml`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js:338-382`, `scripts/vendor-oolite.sh`, `tools/oolite-ingest/{cli,generate,manifest,like-ship}.ts`, `tools/oolite-ingest/convert/{ships,glb,textures,texture-encode,dat}.ts`, `src/content/{ships,index,types}.ts`, `src/content/schemas/ship.ts`, `src/render/asset-cache.ts`, `tests/e2e/{budget,models}.spec.ts`, `tests/compliance-assets.test.ts`, `tests/content/ships-client.test.ts`, `tools/oolite-ingest/{drift,convert/ships}.test.ts`, `tests/golden/content/ships.json`, `docs/PERFORMANCE.md`, `NOTICE`, `ASSETS.md`.
- Oolite checkout `/home/opencode/git/oolite` at pinned commit `7437f22`: `Resources/Config/shipdata.plist` (lines cited above), `Resources/Config/autoAImap.plist`, `Resources/Scripts/oolite-populator.js`, `src/Core/Entities/ShipEntity.m` (520-524, 564, 1723-1724, 2126-2128), `src/Core/Universe.m` (`newShipWithRole`), `src/Core/OORoleSet.m` (probability parsing and `probabilityForRole`), `src/Core/Entities/StationEntity.m` (1474-1481 scavenger launch, 1615 shuttle launch).
- Measurements run in the `wegolite-ci` container (scratchpad scripts `enc.sh`, `probe.ts`, `probe2.ts`): parse and convert of ten `.dat` files, PNG header and emissive bake of 38 textures, `cwebp 1.2.4` sizes, `git show 7437f22:` against checkout sha256 for 48 files.
- Context7 `/vitejs/vite/v8.3.5`: glob import is lazy and chunk-split by default; `?raw` query form; `publicDir` is copied as-is.

### Secondary (MEDIUM confidence)
- None.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH, no new package; every value read from the repository.
- Architecture: HIGH, the extension points are existing explicit constants and were exercised by the probe; the loader and e2e designs reuse existing patterns.
- Pitfalls: HIGH for the pipeline and provenance pitfalls (each tied to a code line); MEDIUM for the gate-selection question (A4) which is an owner preference.
- Ship set: HIGH on role coverage (computed), MEDIUM on the Python omission (judgement within D-01).

**Research date:** 2026-11-13
**Valid until:** 2026-12-13 (stable; invalidated by an Oolite pin bump or by changes to `tools/oolite-ingest/convert/`)
