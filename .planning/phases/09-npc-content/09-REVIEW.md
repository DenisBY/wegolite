---
phase: 09-npc-content
reviewed: 2026-11-14T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - scripts/vendor-oolite.sh
  - src/content/npc-glb-path.ts
  - src/content/schemas/ship-npc.ts
  - src/content/ships-npc.ts
  - src/content/types.ts
  - src/render/asset-cache.ts
  - tests/app/asset-cache-npc.test.ts
  - tests/app/dispose.test.ts
  - tests/content/ships-npc.test.ts
  - tests/e2e/budget.spec.ts
  - tests/e2e/npc-assets.spec.ts
  - tools/oolite-ingest/convert/dat.ts
  - tools/oolite-ingest/convert/glb.test.ts
  - tools/oolite-ingest/convert/glb.ts
  - tools/oolite-ingest/convert/npc-ships.test.ts
  - tools/oolite-ingest/convert/npc-ships.ts
  - tools/oolite-ingest/convert/ships.test.ts
  - tools/oolite-ingest/convert/ships.ts
  - tools/oolite-ingest/convert/texture-encode.test.ts
  - tools/oolite-ingest/convert/textures.test.ts
  - tools/oolite-ingest/convert/textures.ts
  - tools/oolite-ingest/generate.ts
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
  necessity: 0
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-11-14
**Depth:** standard (with cross-file tracing of the lazy-loading path: `generate.ts` -> `npc-ships.ts` -> `ships-npc.json` -> `ships-npc.ts` -> `asset-cache.loadNpcModel`)
**Files Reviewed:** 22
**Status:** issues_found

## Summary

No blocker was found. The security-relevant surface is sound:

- `NPC_GLB_PATH_PATTERN` (`^models\/[a-z0-9][a-z0-9_-]*\.glb$`) has no `.`, `/`, `?`, `#`, `%` or `:` in the name class and no `g`/`m` flag. Traversal, absolute and cross-origin URLs, query strings, a trailing newline (JS `$` does not match before one) and a case change are all rejected before the loader runs. The same constant guards the schema and the cache, so the two cannot drift.
- The memoise/dispose logic is correct. I traced a load that settles after `dispose()`, a failure after `dispose()`, and a re-request after `dispose()`. The identity guard `npcPromises.get(glb) === promise` handles each one, and the `promise` self-reference inside the callbacks is only read asynchronously.
- The cold-start isolation is real: the loader is non-eager `?raw`, only `ships-npc.ts` names the file, and a test and the budget spec both enforce that.
- The generated output is deterministic: it is ordered by `NPC_SHIP_KEYS` and written through `canonicalJson`, and the committed file is compared byte for byte.
- The vendored files still match `CHECKSUMS.sha256`. I ran `sha256sum -c` from the repo root and every row was OK. ASSETS.md has rows for the new files.
- The defaults (`nullAI.plist`, `CLASS_NEUTRAL`) match `ShipEntity.m:520-564` and `:2126`.

The three warnings are an asymmetric failure policy in the catalogue loader, an untested error contract on that loader, and the missing end-to-end proof that the real `GLTFLoader` accepts the new GLBs through `loadNpcModel`.

Structural findings (fallow) were not provided for this review. The necessity reference (`necessity-review.md`) was not loaded, so no necessity findings are reported.

## Warnings

### WR-01: `loadNpcCatalogue` caches a rejected promise forever, unlike `loadNpcModel`

**File:** `src/content/ships-npc.ts:32-58`
**Issue:** `cachedCatalogue ??= (async () => {...})()` stores the promise before it settles and never clears it on rejection. A transient failure of the lazy chunk fetch (offline blip, deploy swap mid-session, CDN 5xx) leaves a permanently rejected promise. Every later `loadNpcCatalogue()` returns that same rejection until the page is reloaded. `AssetCache.loadNpcModel` deliberately does the opposite (a failed load is forgotten so a later call retries), so the two halves of the one lazy path have contradictory failure semantics. Two related gaps in the same function:

- A rejection from `load()` (the dynamic import) is not wrapped, so it does not name `NPC_SHIPS_PATH` like the other errors in this function do.
- `JSON.parse` failures surface a bare `SyntaxError` without the path.

**Fix:**

```ts
export function loadNpcCatalogue(): Promise<NpcShipCatalogue> {
  if (cachedCatalogue === undefined) {
    const attempt = readCatalogue().catch((error: unknown) => {
      if (cachedCatalogue === attempt) cachedCatalogue = undefined; // allow retry
      throw error;
    });
    cachedCatalogue = attempt;
  }
  return cachedCatalogue;
}
```

In `readCatalogue()`, wrap `await load()` and `JSON.parse` in a try/catch that rethrows `new Error(\`Wegolite: failed to read ${NPC_SHIPS_PATH}.\`, { cause })`.

### WR-02: The loader's failure contract (T-09-17) has no test

**File:** `tests/content/ships-npc.test.ts:55-105`
**Issue:** The file header and `ships-npc.ts` promise that "a malformed or extended record fails here with the path named". The tests exercise `NpcShipCatalogueSchema` directly. They never exercise `loadNpcCatalogue`'s error branches, which are:

- the missing-glob branch (`ships-npc.ts:38-42`)
- the invalid-JSON branch
- the `safeParse` failure message formatting (`issue.path.join(".")`)
- the retry-after-failure behaviour that WR-01 asks for

The loader cannot take an injected source, so those branches are unreachable from the suite. `loadNpcCatalogue` is only tested on the happy path against the committed file. That makes "returns the same promise on every call" the only behavioural assertion about memoisation, and it also pins the WR-01 defect in place.

**Fix:** Split the body into `parseNpcCatalogue(rawText: string): NpcShipCatalogue` (pure, exported or tested through a seam) and cover these cases:

- valid text
- non-JSON text
- an extra field (message names the path)
- an empty array

Add a seam such as `loadNpcCatalogue(source = lazyNpcShips[NPC_SHIPS_PATH])` so a rejecting source can verify the retry from WR-01.

### WR-03: The lazy path is never exercised end to end with the real `GLTFLoader`

**File:** `tests/e2e/npc-assets.spec.ts:1-150` (header comment lines 13-18), `tests/app/asset-cache-npc.test.ts`
**Issue:** DATA-13's promise is that NPC models can be loaded on demand through `AssetCache.loadNpcModel`. The browser spec deliberately avoids `GLTFLoader`. It uses raw `fetch` plus `createImageBitmap`, and checks only the GLB magic, version and length, and that each image decodes. The unit tests inject a synthetic loader that returns an empty `THREE.Group`. Nothing ever feeds an NPC GLB through `GLTFLoader.parse`, so these are unproven:

- the hand-written GLB writer's accessors, bufferViews and material extensions parse under three's loader
- the WebP and emissive PNG URIs resolve relative to `models/<name>.glb`
- the result is a `GLTF` whose `scene` has the meshes `dispose()` expects

The independent reader in `glb.test.ts` (`@gltf-transform/core`) is a different parser with different strictness. The first-load models got the same kind of check in `models.spec.ts`; the nine new ones did not.

**Fix:** Add one Playwright (or happy-dom + node `GLTFLoader.parse`) test that loads at least one NPC GLB through the real `GLTFLoader` and asserts a non-empty mesh scene. Parsing all nine in Node with `GLTFLoader.parse` on the committed bytes is cheap if the page-URI texture loading is stubbed.

## Info

### IN-01: `loadNpcModel` accepts any `models/<name>.glb`, including the first-load models and names that are not in the catalogue

**File:** `src/render/asset-cache.ts:135-143`, `src/content/npc-glb-path.ts:9`
**Issue:** The pattern is a shape check, not membership. `loadNpcModel("models/cobra3.glb")` (or `coriolis`/`buoy`) is accepted and creates a second, independently disposed copy of a model `preload()` already owns. A well-formed name that does not exist (`models/typo.glb`) is a 404 that is forgotten after failure, so a populator that spawns N ships of that name issues N requests. It is not a traversal or injection issue; the path stays inside `models/`.
**Fix:** Cheap: reject the three reserved first-load names in `loadNpcModel`. Stronger: have Phase 12 pass the catalogue's `glb` field only, and validate against the loaded catalogue's set where the catalogue is already available. Consider a short negative-cache window for repeated 404s.

### IN-02: The shared `GLTF` is handed to every caller with no ownership or clone contract

**File:** `src/render/asset-cache.ts:40-50, 145-158`
**Issue:** Memoisation returns the same `GLTF` object (same `scene`) to every caller, and `dispose()` frees its geometry, materials and textures. Nothing in the doc comment says that a consumer must clone `scene` and share the resources, or that adding `gltf.scene` to two parents steals it from the first. The `dispose()` comment says "never called by a scene" for the first-load models; the same rule is not stated for NPC models. This is a latent hazard for Phase 12, not a defect today.
**Fix:** Add a sentence to the `loadNpcModel` contract: callers clone `scene` (sharing geometry and materials) and never dispose or mutate the cached resources.

### IN-03: Schema does not tie `glb` to `model`, enforce unique keys, or avoid a dead re-export

**File:** `src/content/schemas/ship-npc.ts:23-34`
**Issue:**

- A record whose `glb` points at another valid model passes. The consistency (`glb === models/${shipGlbFile(model)}`) is enforced only at compile time in `npc-ships.ts` and in the build-time test, not by the strict schema the runtime loader uses.
- Duplicate `key` values are accepted, and `findNpcShip` silently returns the first.
- `export { NPC_GLB_PATH_PATTERN }` (line 23) has no consumer; `asset-cache.ts` and the schema both import from `../npc-glb-path.js` directly.

**Fix:** Add a `.superRefine` that checks key uniqueness on the catalogue schema and, if the naming rule can be shared without importing tool code, `glb` against `model`. Drop the unused re-export.

### IN-04: `compileNpcShips` does not mirror Oolite's `scanClass` alias or flag non-string `ai_type`/`scan_class`

**File:** `tools/oolite-ingest/convert/npc-ships.ts:109-115`
**Issue:** Oolite reads `scan_class` and falls back to the camel-case `scanClass` (`ShipEntity.m:520-525`). The compiler reads only `scan_class`. At the pinned commit no shipdata entry authors `scanClass`, so the output is correct today. A re-vendor that introduces one would silently produce `CLASS_NEUTRAL`. A present-but-non-string `ai_type`/`scan_class` also falls back silently instead of failing the build.
**Fix:** Read `extras["scan_class"] ?? extras["scanClass"]`, and fail through `fail(...)` when the key is present with a non-string value.

### IN-05: `VENDORED_MODEL_FILES` test restates the implementation

**File:** `tools/oolite-ingest/convert/ships.test.ts` (new test "derives the vendored model list from the converted models")
**Issue:** The expected value is the same `[...new Set(Object.values(MODEL_SOURCE_FILES).flat())].sort(...)` expression as the code under test. It cannot fail by changing one side. Only `toHaveLength(16)` is an independent anchor. The behaviour change that matters is that `modelVendored` now also becomes true for the buoy and tutorial-buoy entries, because `buoy.glb`'s sources are in the union. That change is covered by the explicit 32-key `vendored` list, which is the useful assertion.
**Fix:** Replace the restated expression with an explicit list of the 16 expected `.dat` names, or drop the test and rely on the explicit list plus the length check.

### IN-06: Hard-coded counts and timeouts in the e2e and texture tests

**File:** `tests/e2e/budget.spec.ts:236`, `tests/e2e/npc-assets.spec.ts:149`, `tools/oolite-ingest/convert/textures.test.ts:424-447`
**Issue:**

- The magic number `43` (texture count) is duplicated in two specs and must be edited in lockstep whenever an NPC texture is added.
- Two `emitTextures` tests raise their timeout to 180 s with a trailing comment that says the default 5 s was only "passed" under load. That comment sits after the `finally`, outside the test it describes. The timeout hides the slowness instead of recording it.
- The cold-start path match `npcPaths.has(path)` assumes the app is served at `/`; under a non-root `BASE_URL` it would match nothing. The Cobra-liveness assertion would still fail in that case, so the guard is not vacuous.

**Fix:** Derive the expected count from the compiled data (`resolveReferencedTextures`) or export a single constant, and move the timeout rationale into the `it` description.

### IN-07: Vendor script fetches new binaries with no expected digest and word-splits an unquoted list

**File:** `scripts/vendor-oolite.sh:23-26, 144-160`
**Issue:** This is existing design that Phase 9 extends by 51 more files (9 models, 42 textures). The pinned abbreviated 7-char commit (`7437f22`) is resolved by the remote, not by the script. Digests in `CHECKSUMS.sha256` are computed after the download, so the integrity of the bytes rests on TLS plus the commit pin, not on a hash fixed beforehand. `for path in $FILES` relies on the list never containing glob characters or spaces. The script otherwise behaves well: it uses `set -eu`, has no network use outside the explicit vendoring run, stops on non-200 responses, refuses a vendored path with no ASSETS.md row, and has no environment-variable escape.
**Fix:** Pin the full 40-character commit; optionally record expected digests in a committed list that is compared before `CHECKSUMS.sha256` is rewritten.

---

_Reviewed: 2026-11-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
