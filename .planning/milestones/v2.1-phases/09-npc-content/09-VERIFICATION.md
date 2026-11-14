---
phase: 09-npc-content
verified: 2026-11-14T00:50:00Z
status: passed
score: 3/3 roadmap success criteria verified (DATA-10, DATA-13 satisfied; DATA-11 stage 1 met)
covered_files:
  - ".planning/phases/09-npc-content/09-01-PLAN.md"
  - ".planning/phases/09-npc-content/09-01-SUMMARY.md"
  - ".planning/phases/09-npc-content/09-02-PLAN.md"
  - ".planning/phases/09-npc-content/09-02-SUMMARY.md"
  - ".planning/phases/09-npc-content/09-03-PLAN.md"
  - ".planning/phases/09-npc-content/09-03-SUMMARY.md"
  - ".planning/phases/09-npc-content/09-04-PLAN.md"
  - ".planning/phases/09-npc-content/09-04-SUMMARY.md"
  - ".planning/phases/09-npc-content/09-05-PLAN.md"
  - ".planning/phases/09-npc-content/09-05-SUMMARY.md"
  - "ASSETS.md"
  - "NOTICE"
  - "docs/PERFORMANCE.md"
  - "src/content/generated/ships-npc.json"
  - "src/content/npc-glb-path.ts"
  - "src/content/schemas/ship-npc.ts"
  - "src/content/ships-npc.ts"
  - "src/render/asset-cache.ts"
  - "tests/e2e/budget.spec.ts"
  - "tests/e2e/npc-assets.spec.ts"
  - "third_party/oolite/CHECKSUMS.sha256"
  - "tools/oolite-ingest/convert/glb.ts"
  - "tools/oolite-ingest/convert/npc-ships.ts"
covered_digest: "v4:sha256:fcc84c65f317d11a01d89772a80884726c022b6e3266531ef76188e61c0abf57"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 9: NPC Content Verification Report

**Phase Goal:** The ships of the six populator roles exist as compiled content: models and textures from the pinned Oolite snapshot with provenance, ship records carrying the fields the inert world uses, and lazy loading that keeps them out of the first load.
**Verified:** 2026-11-14
**Status:** passed
**Re-verification:** No, initial verification

All evidence below was gathered from the codebase and from fresh Docker runs in this session, not from SUMMARY claims.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The content build emits models and WebP textures for the six populator roles from the pinned snapshot; every vendored file is in `ASSETS.md`, `NOTICE`, `CHECKSUMS.sha256`; `assets:check` fails on drift; no sound/music/pod/missile/capsule/wreckage/asteroid | VERIFIED | See "Criterion 1" below |
| 2 | Each ship record carries roles, AI name, scan class, model from `shipdata.plist` with `like_ship` resolved; worked examples pin Viper, a trader and a pirate; no combat/flight stats | VERIFIED | See "Criterion 2" below |
| 3 | NPC models and textures sit outside the first-load set; a cold start fetches none; a role model is fetchable on demand and decodes; cold-start transfer stays under 9,437,184 | VERIFIED | See "Criterion 3" below |

**Score:** 3/3 truths verified, 0 behavior-unverified. No behavior-dependent invariant lacks a test (lazy load, memoise, forget-on-failure, dispose and late-settle are exercised in `tests/app/asset-cache-npc.test.ts` and `tests/app/dispose.test.ts`, both re-run green).

### Criterion 1: models, WebP textures, provenance, drift gate

- Diff against the plan base `c8f9f32` adds exactly 42 files under `third_party/oolite/` (9 `.dat` in `Models/`, 33 PNG in `Textures/`) and 52 files under `public/` (9 GLBs in `public/models/`, 43 images in `public/textures/`: 33 `.webp` plus 10 baked `_emissive.png`). `CHECKSUMS.sha256` gains 42 lines and removes none (117 lines total); `pin.json` is unchanged.
- `sha256sum -c third_party/oolite/CHECKSUMS.sha256` from the repo root: 117 OK, 0 failed.
- Independent byte-identity check, each of the 42 vendored files against `git -C /home/opencode/git/oolite show 7437f22:Resources/<path>`: `checked=42 mismatches=0`.
- `ASSETS.md`: each of the 94 added files has exactly one row (checked per path with a whitespace-tolerant row regex); vendored inputs read `vendored-input | Oolite 1.93.1-241 @ 7437f22`, outputs read `generated-asset | derived from <source>`. `NOTICE` lines 44-47 cover every `public/models/*.glb` as CC BY-NC-SA derivative works; `tests/compliance.test.ts` and `tests/compliance-assets.test.ts` (28 tests) pass in Docker.
- `docker compose run --rm assets npm run assets:check` run in this session: `assets:check: no differences`, exit 0. The generated records, GLBs, textures, `manifest.json` and `texture-encodings.json` regenerate byte-identical.
- Forbidden assets: a name scan of every file added since `c8f9f32` for pod, missile, capsule, wreck, asteroid, sound, music, `.ogg`, `.wav`, `.mp3`, `.oxp` finds nothing. `npc-ships.test.ts` "compiles no cargo, rock, wreckage or missile role and ships no audio" pins the same.
- Per-role coverage, computed from `ships-npc.json`: trader = adder, cobramk1, moray; pirate = adder, cobramk1, gecko, krait, mamba, moray, sidewinder; police = viper; hunter = gecko, krait, mamba, sidewinder; shuttle = adder, shuttle; scavenger = adder, cobramk1. All six roles have at least one compiled model.
- GLB decode proof: `tests/e2e/npc-assets.spec.ts` (run, passed) serves all nine GLBs and decodes all 43 referenced images via `createImageBitmap`; `tools/oolite-ingest/convert/glb.test.ts` (28 tests) re-run green.

### Criterion 2: record fields (DATA-11 stage 1)

`src/content/generated/ships-npc.json` holds nine records with exactly six fields (`aiType`, `glb`, `key`, `model`, `roles`, `scanClass`), behind the strict `NpcShipSchema` (extra field rejected, tested). I cross-read the plist at `/home/opencode/git/oolite/Resources/Config/shipdata.plist`:

| Record | Plist evidence (resolved template) | Compiled |
|--------|------------------------------------|----------|
| viper | `oolite_template_viper`: `oolite-policeAI.js`, `oolite_viper.dat`, roles `police`, `CLASS_POLICE` | match |
| adder (trader) | `oolite_template_adder`: `oolite-scavengerAI.js`, `oolite_adder.dat`, roles `trader(0.25) trader-courier(0.5) ...`, no `scan_class` | match, `CLASS_NEUTRAL` default |
| sidewinder / mamba / krait / gecko (pirate/hunter) | via `like_ship` to `oolite_template_*`; `oolite-pirateAI.js` | match |
| cobramk1 (trader/scavenger) | `oolite_template_cobramk1`: `oolite-traderAI.js`, roles line as compiled | match |
| shuttle | `oolite_template_shuttle`: `oolite-shuttleAI.js`, roles `shuttle` | match |

The `CLASS_NEUTRAL` and `nullAI.plist` defaults follow `ShipEntity.m:520/2126` and `ShipEntity.m:564` (checked in the Oolite checkout). The hand-written golden `tests/golden/content/ships-npc.json` pins the Viper, Adder, Sidewinder, Shuttle and Gecko; `npc-ships.test.ts` (18 tests: like_ship equals template parent, byte-for-byte regeneration, golden equality, missing-key failures) passes. No combat or flight stat field exists in the record or schema (DATA-15 untouched). **DATA-11 stage 1: met.** DATA-11 stays Pending for Phase 10 (mass), consistent with REQUIREMENTS.md.

### Criterion 3: lazy loading and the ceiling

- Nothing on the boot path imports the lazy modules: `rg` over `src` and `tools` shows `ships-npc.ts` and `loadNpcModel` referenced only by their own definitions (and the manifest); `tests/content/ships-npc.test.ts` "boot-path isolation" source-scan tests pass. In the production build (`dist/assets`) there is no chunk carrying the NPC records, and `rg` for `oolite-policeAI` in `dist/assets/*.js` finds nothing: the entry chunk contains no NPC record (the loader is tree-shaken until Phase 12 imports it).
- `AssetCache.loadNpcModel` (`src/render/asset-cache.ts:135`): refuses paths outside `models/<name>.glb` without a loader call, memoises per path, forgets failures, frees on `dispose()`, does not cache a load settling after dispose; `preload()` still loads only cobra, coriolis, buoy. 13 + 12 tests green.
- Cold start request log (`tests/e2e/budget.spec.ts`, run in this session via `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/budget.spec.ts tests/e2e/npc-assets.spec.ts"`): 4 passed. The test asserts the NPC set is 9 GLBs and 43 textures, that `cobra3.glb` is in the log (vacuity guard) and that no NPC path is requested.
- Measured cold-start transfer, reproduced in this session through the Playwright JSON reporter annotation: `8834862 bytes (ceiling 9437184)`. `FIRST_LOAD_BYTES_CEILING = 9 * MIB = 9,437,184` is unchanged (D11: not raised); headroom 602,322 bytes. The +20,638 bytes over the 2026-11-11 baseline (8,814,224) is recorded in `docs/PERFORMANCE.md` with its date.
- A role model is fetchable on demand and decodes: `npc-assets.spec.ts` passed (all nine GLBs, all 43 images).

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| 42 vendored sources under `third_party/oolite/` | VERIFIED | checksums OK, byte-identical to checkout at 7437f22 |
| 9 GLBs + 43 images under `public/` | VERIFIED | assets:check no drift, e2e decode passes |
| `src/content/generated/ships-npc.json` | VERIFIED | six-field records, golden-pinned, drift-gated |
| `src/content/ships-npc.ts`, `schemas/ship-npc.ts`, `npc-glb-path.ts` | VERIFIED (lazy, validated) | loader tested; not yet consumed by the app (Phase 12) |
| `AssetCache.loadNpcModel` | VERIFIED | substantive, tested; consumer arrives in Phase 12 |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| `scripts/vendor-oolite.sh` | `CHECKSUMS.sha256` / `ASSETS.md` | WIRED | 42 lines and 42 rows, compliance tests green |
| `EMITTED_ENTRIES` / `MODEL_SOURCE_FILES` | GLB emission, `modelVendored`, NPC records | WIRED | `assets:check` no differences |
| `ships-npc.json` `glb` field | `public/models/*.glb` | WIRED | `npc-ships.test.ts` "finds the file under public/", e2e serves all nine |
| `NPC_GLB_PATH_PATTERN` | schema and `loadNpcModel` | WIRED | both reject paths outside `models/<name>.glb` |

### Data-Flow Trace (Level 4)

The records are compiled from the resolved plist at build time and re-derived byte for byte by `assets:check`; the models are derived from the vendored `.dat` bytes. The runtime consumers (populator) are Phase 12, so no rendered value is hollow in this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-10 | 09-01, 09-02, 09-03, 09-04 | Models and textures of the six populator roles compiled with provenance behind the drift gate | SATISFIED | Criterion 1 |
| DATA-13 | 09-04, 09-05 | Lazy loading outside the first-load set; cold start under 9,437,184 | SATISFIED | Criterion 3 |
| DATA-11 (stage 1 only) | none (staged by ROADMAP criterion 2) | Record fields: roles, AI name, scan class, model | MET (stage 1); requirement remains Pending for Phase 10 | Criterion 2 |

Every requirement ID in the plans (`DATA-10`, `DATA-13`) appears in REQUIREMENTS.md (lines 18, 20; traceability lines 65, 67, both Complete). REQUIREMENTS.md maps no other ID to Phase 9, so there are no orphaned requirements.

### Behavioral Spot-Checks and Docker Runs (this session)

| Check | Command | Result |
|-------|---------|--------|
| Drift gate | `docker compose run --rm assets npm run assets:check` | no differences, exit 0 |
| Targeted unit tests | `docker compose run --rm test npx vitest run tests/content/ships-npc.test.ts tests/app/asset-cache-npc.test.ts tools/oolite-ingest/convert/npc-ships.test.ts tests/compliance-assets.test.ts tests/compliance.test.ts tests/app/dispose.test.ts` | 6 files, 81 tests passed |
| GLB and ship converters | same, `glb.test.ts` and `ships.test.ts` | 2 files, 42 tests passed |
| Cold start + decode | `budget.spec.ts` + `npc-assets.spec.ts` after `npm run build` | 4 passed |
| Cold-start bytes | Playwright JSON annotation | 8834862 (ceiling 9437184) |

Full `verify` (139 files, 2540 tests, build, 27 e2e smoke) was reported green by the caller on the final tree; it was not re-run here, only the targeted subset above.

### Probe Execution

No phase-declared probes (`scripts/*/tests/probe-*.sh`). Skipped.

### Anti-Patterns Found

No `TBD`/`FIXME`/`XXX` debt markers or stubs in the phase's source files that reach rendering. The open items in `09-REVIEW.md` (0 critical, 3 warning, 7 info) do not touch the three success criteria; for the record:

| Item | Severity | Impact |
|------|----------|--------|
| WR-01 `loadNpcCatalogue` caches a rejected promise forever (unlike `loadNpcModel`) | Warning | No consumer yet; fix when Phase 12 wires the populator |
| WR-02 the loader's failure contract (T-09-17) has no test | Warning | Happy path and schema rejection are tested |
| WR-03 the lazy path is not exercised with the real `GLTFLoader` | Warning | Decode is proven through `createImageBitmap` plus the independent GLB reader instead |
| IN-01..IN-07 | Info | Hardening and test hygiene |

### Notes (non-blocking)

- The lazy catalogue chunk does not appear in `dist/assets` because no source imports `ships-npc.ts` yet; the lazy split is therefore proven by source scan and unit test, and will show in the bundle once Phase 12 imports it. Phase 12 should re-check the cold-start log when it does.
- `docs/PERFORMANCE.md` still gives the entry chunk size (1,615,497 bytes) dated 2026-11-10; the current `dist` entry chunk is 1,677,311 bytes. This predates or is independent of Phase 9's content (the NPC records are not in it) and does not affect the ceiling, but the row is stale.
- Phase 9 changed `src/render/asset-cache.ts`, which AGENTS.md lists as a `verify-full` trigger; the owner chose `verify` for this phase once, recorded in `.planning/PROJECT.md` Key Decisions.
- The network vendoring exception (script fetch at 7437f22) is recorded in Key Decisions; this session's independent 42-file cross-check against the checkout confirms zero mismatches.

### Human Verification Required

None. Every success criterion has automated, reproduced evidence.

### Gaps Summary

No gaps. The ships of the six populator roles are compiled content with provenance and a drift gate; the nine records carry the six inert-world fields resolved from `shipdata.plist`; the models and textures stay out of the cold start (0 requests, 8,834,862 bytes against the unchanged 9,437,184 ceiling) and load and decode on demand.

---

_Verified: 2026-11-14_
_Verifier: Claude (gsd-verifier)_
