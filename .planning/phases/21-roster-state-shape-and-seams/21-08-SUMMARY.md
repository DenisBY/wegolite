---
phase: 21-roster-state-shape-and-seams
plan: 08
subsystem: content-pipeline
tags: [oolite-ingest, npc-roster, glb, webp, hull-octree, content-build]
requires:
  - phase: 21-02
    provides: vendored 21-02 hulls (9 .dat) and 51 PNGs with provenance
  - phase: 21-04
    provides: ShipHull.aliases, hullTable alias registration, derived roster counts
  - phase: 21-05
    provides: the NPC record fields, the lifted aft refusal, the widened schema model pattern
provides:
  - the 29-record NPC catalogue (28 resolved roster records plus shuttle)
  - one GLB per record, named after the record key in lower case
  - 47 more WebP textures (51 with the Asp's four) and their emissive bakes
  - one hull entry per model (19 entries for 30 keys) with aliases
affects: [21-09, 21-11, 21-12, 21-16, 21-17, 21-18, 21-19, phase-22, phase-23]
tech-stack:
  added: []
  patterns:
    - "per-record GLB naming through npcGlbFile(key), checked against NPC_GLB_PATH_PATTERN"
    - "hull octrees shared per model through ShipHull.aliases"
key-files:
  created:
    - public/models/*.glb (19 new NPC record GLBs; asp.glb came with the tracer)
    - public/textures/ (47 WebP maps and 21 emissive bakes, plus the Asp's)
  modified:
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/glb.ts
    - tools/oolite-ingest/convert/textures.ts
    - tools/oolite-ingest/convert/dat.ts
    - src/content/schemas/ship-hull.ts
    - src/content/generated/ (ships-npc, ships-hulls, ships, manifest, texture-encodings)
    - ASSETS.md
    - tests/golden/content/ (ships-npc, ships-hulls, ships)
key-decisions:
  - "One GLB per record, lower-cased key (RESEARCH A2): morayMED -> moraymed.glb; npc-glb-path.ts stays lower-case only and unedited"
  - "shuttle stays (RESEARCH A1): 29 compiled records, 20 new"
  - "MAX_HULLS 16 -> 24; MAX_HULL_ARTIFACT_BYTES stays 200000 (162,546 measured, 81 percent)"
  - "The nine new model extents join MODEL_BOUNDS (dat.ts), measured from the pinned .dat files"
requirements-completed: [DATA-17, DATA-18]
duration: ~3h
completed: 2026-11-26
status: complete
actuals:
  tokens: 120000
  tasks: 2
  commits: 3
plan_head_before: e7a3a61543954efca635af1f6123856c69fcbfa2
plan_head_after: f88b64ce57eaa855a184bdda7e574618617f535c
---

# Phase 21 Plan 08: The 29-record NPC catalogue, its GLBs, textures and shared hulls Summary

**The NPC catalogue grows from 9 to 29 records, each with its own GLB, the 51 vendored textures are WebP-encoded, and 30 ship keys share 19 hull octrees, while the inert world, the twin literals and the 21-seed run stay unchanged.**

## Performance

- **Duration:** about 3 hours of wall time (asset builds of about 3 minutes each, remote runs 1 to 4 minutes)
- **Completed:** 2026-11-26
- **Tasks:** 2 (a tracer, then the expansion)
- **Commits:** 085d0105 (tracer), cfd29301 (expansion), f88b64ce (browser-spec fix)

## Accomplishments

- **Tracer (Task 1).** `asp` went through the whole pipeline first: vendored `.dat`, converter, strict schema, generated JSON, GLB and four WebP maps, hull entry, goldens, per-key and per-model tables. The ten earlier hull entries stayed byte-identical (the diff was 101 added lines, 0 removed). The tracer gate re-ran the task's verify commands (targeted Vitest, `assets:check`); they passed and expansion went ahead.
- **Roster (DATA-17).** `NPC_SHIP_KEYS` is the 28 records the in-scope roles resolve to plus `shuttle` (29, code-unit sorted). The roster equality test derives the 28 from `src/content/generated/ships.json` (non-template records whose role tokens, probability suffixes stripped, meet the 20 in-scope roles), asserts 28 records on 18 models and fails on any difference with `NPC_SHIP_KEYS`. The compiled aft weapons are exactly the six hulls the research named: `anaconda` EQ_WEAPON_PULSE_LASER, `anaconda-pirate`, `boa`, `boa-pirate`, `boa-mk2`, `boa-mk2-pirate` EQ_WEAPON_BEAM_LASER, each with its authored aft position. None of the 29 authors a port or starboard type, `accuracy`, `reaction_time` or `scanner_range` (a test checks it, and the build passing proves the refusal loop saw none).
- **GLBs and textures (DATA-18).** Each record owns one GLB through `npcGlbFile(key)` (key lower-cased, then checked against the anchored `NPC_GLB_PATH_PATTERN`); `shipGlbFile` (the model rule, now accepting `oolite_boa-mk2.dat`) stays for the debris models. `emitSingleMeshGlbs` passes the owner to the naming rule. 19 new GLBs (39 in `public/models/`), `VENDORED_TEXTURES` grew by 51 to 110 names, 47 WebP maps and 21 emissive bakes were added beyond the Asp's, every generated file has an `ASSETS.md` row (87 rows in Task 2, 6 in Task 1), and `assets:check` and `tests/compliance-assets.test.ts` pass.
- **Hulls.** `ships-hulls.json` holds 19 entries for 30 keys (the player's Cobra plus 29 records). The player's entry lists `cobra3-alternate`, `cobra3-pirate`, `cobra3-trader`; the other aliases are `anaconda-pirate`, `boa-pirate`, `boa-mk2-pirate`, `cobramk1-alt`, `mamba-escort`, `morayMED`, `python-blackdog`, `viper-pursuit`. The ten earlier entries differ from before only by the new `aliases` members: the full Task 2 diff of the file is 101 insertions and 0 deletions. A test pins the entry count and the alias map; `traffic.test.ts` pins that an alias and its entry key share one `HullData` object.

## Roster equality evidence

`ships.json` filtered by the 20 in-scope role tokens gives 28 non-template records on 18 models: adder, anaconda, anaconda-pirate, asp, boa, boa-mk2, boa-mk2-pirate, boa-pirate, cobra3-alternate, cobra3-pirate, cobra3-trader, cobramk1, cobramk1-alt, ferdelance, gecko, krait, mamba, mamba-escort, moray, morayMED, python, python-blackdog, python-trader, sidewinder, sidewinder-escort, viper, viper-interceptor, viper-pursuit. Plus `shuttle` (its only role is `shuttle`, outside the in-scope set; kept for `INERT_POPULATION` and the `?test=1` flyer hook). This is the flagged assumption: 29 compiled records satisfy the roadmap's "about 28".

## GLB naming decision

One GLB per record, `models/<key lower-cased>.glb`. Reasons: variants own their own texture sets (cobra3-pirate, mamba-escort, morayMED, ...), the existing `owners.length === 1` rule holds unchanged, `cobra3.glb` stays the player's alone, and `src/content/npc-glb-path.ts` stays lower-case only and unedited. A test checks the 29 names are distinct after lower-casing and pass the pattern; a key outside the pattern fails the build; a model name outside the widened anchored `oolite_[a-z0-9_-]+.dat` pattern still fails.

## Hull entry count, bytes and caps

| Measure | Before | After | Cap |
|---------|--------|-------|-----|
| hull entries | 10 | 19 (30 keys) | `MAX_HULLS` raised 16 -> 24 (five entries of headroom) |
| `ships-hulls.json` bytes | 89,673 | 162,546 | `MAX_HULL_ARTIFACT_BYTES` unchanged at 200,000 (81 percent used, measurement in the doc comment) |
| `ships-npc.json` bytes | 12,701 | 52,028 | none (boot-loaded; see below) |

## Shared-geometry list (input to plans 21-11, 21-17 and 21-18)

29 NPC GLBs total 3,030,300 bytes (the nine legacy ones 820,068, the 20 new 2,210,232). The unique texture files the 29 GLBs reference: 122 files, 29,816,475 bytes, of which 6 files (1,604,420 bytes) are also referenced by the first-load Cobra, so the NPC-owned set is 116 files, 28,212,055 bytes (the nine legacy records referenced 43 files, 11,528,725 bytes). Records whose GLBs share geometry (identical BIN chunk), with byte sizes and whether their textures differ:

| Model | Records (GLB bytes) | Textures |
|-------|---------------------|----------|
| oolite_anaconda.dat | anaconda 158,304; anaconda-pirate 158,332 | identical sets (the GLBs differ by a few bytes of JSON only) |
| oolite_boa-mk2.dat | boa-mk2 142,000; boa-mk2-pirate 142,020 | identical sets |
| oolite_boa.dat | boa 123,256; boa-pirate 123,276 | identical sets |
| oolite_cobra3.dat | cobra3-alternate 120,160; cobra3-pirate 120,164; cobra3-trader 120,136 | differ in the diffuse map (`_alt`, `_pirate`, base); share the other maps with the player's Cobra |
| oolite_cobramk1.dat | cobramk1 81,332; cobramk1-alt 81,356 | differ in the diffuse map (`_alt`) |
| oolite_mamba.dat | mamba 78,212; mamba-escort 78,264 | differ in the diffuse map (`_escort`) |
| oolite_moray.dat | moray 104,520; morayMED 104,520 | differ in the diffuse map (`_med`) |
| oolite_python.dat | python 104,380; python-blackdog 104,452 | differ in the diffuse map (`_blackdog`) |
| oolite_viper.dat | viper 78,948; viper-pursuit 79,020 | differ in the diffuse map (`_pursuit`) |

Models with a single record: adder, asp, ferdelance, gecko, krait, python_trader, shuttle, sidewinder, sidewinder_escort, viper_interceptor. The nine groups above are the candidates for plan 21-18's variant families, and the primitive counts (1 to 3 per hull) are plan 21-17's input.

## First-load measurement (input to plan 21-11)

Remote `budget.spec.ts` and `traffic.spec.ts` at snapshot f88b64ce (browser-test bundle, annotations read from the JSON report; ceiling 9,437,184 bytes):

| Cold start to the first in-flight frame | Bytes | Headroom |
|-----------------------------------------|-------|----------|
| traffic off | 8,899,305 | 537,879 |
| traffic on | 8,930,637 | 506,547 |

For reference, the plan-12 and Phase 16 figures were 8,866,124 (traffic off) and 8,878,213 (traffic on) on 2026-11-17. No NPC GLB or NPC-owned texture is requested before the first in-flight frame in either mode (both specs assert it). The traffic-on world requested 6 GLBs and 26 textures after the first in-flight frame, all finished within the frame window, with 9 draw calls at the first in-flight frame and 17 after the window.

## Task Commits

1. **Task 1: the Asp end to end (tracer)** - `085d0105`
2. **Task 2: the other 19 records, naming, aliases, caps, roster test** - `cfd29301`
3. **Browser-spec fix found by the remote run** - `f88b64ce`

## Remote runs

| Run | Snapshot | Result | Elapsed |
|-----|----------|--------|---------|
| `run --rm verify` | cfd29301 | exit 0; 295 test files, 8,341 tests passed (10 skipped); 28 smoke e2e passed | 216 s |
| e2e `budget`, `traffic`, `npc-assets` (first run) | cfd29301 | exit 1: budget and traffic failed on six Cobra textures (see Deviations) | 34 s |
| e2e `budget`, `traffic`, `npc-assets` (after the fix) | f88b64ce | exit 0; 8 passed | 69 s |
| same specs with the JSON reporter (measurements above) | f88b64ce | exit 0 | 70 s |
| `run --rm test npm run test:acceptance` (the 20-seed QUAL-12 run) | cfd29301 | exit 0; 21 of 21 passed | 89 s |

The acceptance run is the frozen 21 of 21 the plan names. It ran at the first Task 2 commit; the only later commit changes two e2e specs.

## Inert world, twins, epoch pin

Unchanged. `tests/golden/world/`, `tests/app/session/tick-parity.test.ts` and `src/sim/world/populate.ts` have no diff against the plan base. `tests/sim/world/inert-isolation.test.ts` (the nine legacy records' inert fields equal `inert-records-nine.json`, the epoch 1-20 pin) passes in the local full run and in remote `verify`. Nothing was re-pinned.

## Decisions Made

- One GLB per record with lower-cased key names (A2); `shuttle` kept (A1).
- `MAX_HULLS` 24; the byte cap is not raised because the measured artefact fits.
- The nine new models' extents were added to `MODEL_BOUNDS` from the pinned meshes; per-mesh hull masses (the `HULL_MASSES` table) are the converter's own float32 values, not an external cross-check (the community wiki table of the nine stock masses was not re-consulted for the eight new hulls; no network).
- The `?test=1` and populator paths stay on the nine legacy records through `INERT_RECORD_KEYS` (21-01); this plan changed no populator code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `MODEL_BOUNDS` had no entry for the nine new models**
- **Found during:** Task 1 (`DAT_MESH ... no recorded bounding box for "oolite_asp.dat"`)
- **Issue:** `generate.ts` asserts every converted model against `MODEL_BOUNDS` in `dat.ts`; the 21-02 hulls were vendored without extents. `dat.ts` is not in the plan's file list.
- **Fix:** measured the nine spans from the pinned `.dat` files (the existing 23 entries reproduce exactly with the same script) and added them.
- **Files modified:** `tools/oolite-ingest/convert/dat.ts`
- **Commit:** 085d0105

**2. [Rule 1 - Bug] Cold-start guards treated textures shared with the player's Cobra as NPC-owned**
- **Found during:** the first remote `budget.spec.ts` and `traffic.spec.ts` run
- **Issue:** the Cobra Mk III variant GLBs reference the maps the first-load `cobra3.glb` already requests, so the "no NPC path before the first in-flight frame" assertion flagged six Cobra textures. With nine records none shared a texture with a first-load model.
- **Fix:** both specs drop the texture paths the three first-load GLBs (Cobra, Coriolis, buoy) reference from the NPC path set (`firstLoadTexturePaths`); the vacuity guards keep counting every NPC texture.
- **Files modified:** `tests/e2e/budget.spec.ts`, `tests/e2e/traffic.spec.ts`
- **Commit:** f88b64ce

**3. [Rule 1 - Bug] Tests and a doc claim hard-coded the nine records, the ten hulls or the old texture counts**
- **Found during:** the local full `test` run after Task 2
- **Fix:** `asset-cache-npc`, `start-session` (hull table size 14 to 34), `traffic.test.ts` (laser colours of the three Viper variants, 29 records, flight rows, debris hulls, hull keys in entry order with aliases), `step-integration` (29 committed kinds), `debris.test.ts` (n_alloys pinned for 29 hulls, the plate bound is `floor(n_alloys)`: the heaviest hull has n_alloys 2.92 so up to two plates), `ships-npc.test.ts`, `ship-hulls.test.ts`, `npc-assets.spec.ts` (the hard-coded 43 unique images became the set read from the committed GLB JSON chunks), `texture-encode.test.ts` counts. The `src/sim/world/debris.ts` comment "0 or 1 plates for every compiled hull" was corrected (comment only, no behaviour change).
- **Commit:** cfd29301

**4. [Rule 3 - Blocking] A quadratic texture-tree test timed out at 110 names**
- **Issue:** `textures.test.ts` re-resolved the texture closure once per allowlisted name inside a filter; at 110 names it exceeded the 5 s limit on a loaded machine. Fixed by resolving once (no timeout changed).
- **Commit:** cfd29301

### Plan/execution notes

- `VENDORED_MODEL_FILES` in `ships.ts` is derived from `MODEL_SOURCE_FILES`, so the plan's "add the eight remaining models to `VENDORED_MODEL_FILES`" needed no edit there. `npc-glb-path.ts` already allowed the hyphen; only the converter's model pattern needed widening (`glb.ts`).
- The plan listed `tests/golden/content/ships-hulls.json` and `ships-npc.json`; `tests/golden/content/ships.json` also changed (the `vendoredModelEntries` list grows with the vendored models, 45 to 65 names).
- A full local `test` run timed out sporadically on two heavy tests (the lint-guard `Math.sin` case, the texture tree) under machine load; both pass alone and in remote `verify`.

## Issues Encountered

None open. The full local `test` was green except the two timeouts above, rerun alone; remote `verify` was green.

## Known Stubs

None. No hardcoded empty value or placeholder reaches a rendering path from this plan's files.

## Threat Flags

None. The surface (generated JSON and GLB/WebP files under `public/`) is the one the plan's threat model covers; T-21-09 is mitigated by `npcGlbFile` plus the anchored pattern (tests for upper-case keys, path separators and a trailing newline), T-21-10 by the measured hull caps and the first-load measurement above.

## Next Phase Readiness

- Plan 21-11 takes the byte figures above (GLBs 3,030,300 bytes; NPC-owned textures 28,212,055 bytes; the first-load numbers and headroom) for `docs/PERFORMANCE.md` and the prefetch volume.
- Plans 21-17 and 21-18 take the shared-geometry table.
- FIDELITY: no new divergence row is needed here (the roster and assets are Oolite's data). The ECM clause that wave 2 asked for 21-05 is not this plan's.

## Self-Check: PASSED

- Created files exist: 39 GLBs under `public/models/` (`ls public/models/*.glb | wc -l` is 39), `ships-npc.json` holds 29 `"key":` rows, `ships-hulls.json` holds 19 entries and 9 `"aliases"` members.
- Commits exist on this branch: 085d0105, cfd29301, f88b64ce.
- `assets:check` reports no differences; `lint` and `typecheck` pass.
