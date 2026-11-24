---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 05
subsystem: content-compiler
tags: [content, explosions, particle-textures, bounding-box, data-16, world-17, drift-gate, qual-11]
status: complete

requires:
  - phase: 16-01
    provides: "the vendored explosions.plist, oolite-particle-cloud2.png and oolite-particle-flash.png under third_party/oolite/"
  - phase: 16-03
    provides: "the lazy debris loader and converter pattern (loadDebrisCatalogue, compileDebris/emitDebris) this plan mirrors"
provides:
  - "src/content/generated/explosions.json: one strict record, oolite-default-ship-explosion, behind the drift gate"
  - "tools/oolite-ingest/convert/explosions.ts: EXPLOSIONS_PATH, EXPLOSIONS_SOURCE_FILE, EXPLOSION_KEYS, compileExplosions, emitExplosions"
  - "src/content/schemas/explosion.ts: ExplosionRecordSchema, ExplosionCatalogueSchema, DEFAULT_EXPLOSION_KEY, MAX_EXPLOSION_RECORDS, MAX_EXPLOSION_COUNT, EXPLOSION_COLOR_ORDERS, PARTICLE_TEXTURE_PATTERN; ExplosionRecord and ExplosionCatalogue on the type-only door"
  - "src/content/explosions.ts: loadExplosionCatalogue (lazy, validated, cached)"
  - "PARTICLE_TEXTURES and copyParticleTextures in convert/textures.ts; public/textures/oolite-particle-cloud2.png and oolite-particle-flash.png byte-identical copies"
  - "NpcShip.boundingBox { min, max }: float32 hull vertex extremes in Oolite's model axes, on all nine NPC records"
  - "ESLint denial **/content/explosions* in src/sim with a lint-probe guard"
affects: [16-06, 16-07, 16-09]

plan_head_before: 44784d1a462e8a8032eb25066134d74c7a222f72
plan_head_after: 79d2bbce32352cc9e508a462bd9754a342eba81c
commits: 2

actuals:
  tokens: 20970
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A render-only content file joins as converter + strict schema + lazy ?raw loader + ESLint sim denial with a lint probe"
    - "Field types follow Oolite's readers: oo_floatForKey keys stored as float32, oo_doubleForKey keys as authored"

key-files:
  created:
    - tools/oolite-ingest/convert/explosions.ts
    - tools/oolite-ingest/convert/explosions.test.ts
    - src/content/schemas/explosion.ts
    - src/content/explosions.ts
    - src/content/generated/explosions.json
    - tests/content/explosions.test.ts
    - tests/golden/content/explosions.json
    - public/textures/oolite-particle-cloud2.png
    - public/textures/oolite-particle-flash.png
  modified:
    - tools/oolite-ingest/convert/textures.ts
    - tools/oolite-ingest/convert/textures.test.ts
    - tools/oolite-ingest/convert/npc-ships.ts
    - tools/oolite-ingest/convert/npc-ships.test.ts
    - tools/oolite-ingest/generate.ts
    - src/content/schemas/ship-npc.ts
    - src/content/types.ts
    - src/content/generated/ships-npc.json
    - src/content/generated/manifest.json
    - tests/content/ships-npc.test.ts
    - tests/golden/content/ships-npc.json
    - tests/guards/content-boundary.test.ts
    - eslint.config.js
    - ASSETS.md
    - NOTICE

key-decisions:
  - "D16-22 implemented: explosions.json holds only oolite-default-ship-explosion; the record keeps Oolite's reader types (alpha, brightness, growthRate, size, spread as float32 via oo_floatForKey; duration as authored via oo_doubleForKey; count an unsigned integer, authored 25, capped by the render in 16-07)"
  - "D16-23 implemented: NpcShip.boundingBox is { min: [x,y,z], max: [x,y,z] }, Math.fround of the hull .dat vertex extremes in Oolite's model axes, no subentity; the schema requires finite triples and min <= max per axis"
  - "A compiled explosion record's texture must be in PARTICLE_TEXTURES (cloud2, flash) as well as match oolite-particle-<name>.png; a plist failure names explosions.plist with the line and column of the entry"

patterns-established:
  - "Explosion and particle data are render-only: src/content/explosions* is denied to src/sim like the Phase 5 loaders"

requirements-completed: [DATA-16, WORLD-17]  # copied verbatim from the plan; WORLD-17 is advanced here and closes with 16-07..16-09 (the shared-ID gate keeps REQUIREMENTS.md open until then)

coverage:
  - id: D1
    description: "The default ship explosion setting compiles from the vendored plist with Oolite's defaults into a strict, golden-pinned explosions.json behind the drift gate"
    requirement: DATA-16
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/explosions.test.ts"
        status: pass
      - kind: unit
        ref: "tests/content/explosions.test.ts"
        status: pass
      - kind: other
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D2
    description: "The cloud and flash particle textures ship byte-identical to the vendored files with ASSETS.md rows and a NOTICE sentence"
    requirement: DATA-16
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/textures.test.ts#ships the particle textures byte-identical to the vendored files (D16-08)"
        status: pass
      - kind: unit
        ref: "tests/compliance-assets.test.ts"
        status: pass
      - kind: unit
        ref: "tests/compliance.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "loadExplosionCatalogue loads lazily and src/sim cannot import it"
    requirement: WORLD-17
    verification:
      - kind: unit
        ref: "tests/content/explosions.test.ts#loadExplosionCatalogue"
        status: pass
      - kind: unit
        ref: "tests/guards/content-boundary.test.ts#fails lint when the sim imports the render-only explosion settings (D16-22)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every NPC record carries its hull's bounding box, pinned by an independent golden, within MODEL_BOUNDS, schema-checked"
    requirement: DATA-16
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/npc-ships.test.ts#the hull bounding box (D16-23)"
        status: pass
      - kind: unit
        ref: "tests/content/ships-npc.test.ts#the hull bounding box (D16-23)"
        status: pass
    human_judgment: false
  - id: D5
    description: "QUAL-11 standing gate after the ships-npc.json change: the frozen 20-seed acceptance run"
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance at 79d2bbc"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-11-17
---

# Phase 16 Plan 05: Explosion Settings, Particle Textures and the Hull Box Summary

**The default ship explosion compiles from the vendored `explosions.plist` with `OOExplosionCloudEntity.m`'s defaults into a strict, lazily loaded `explosions.json`. Its cloud and flash particle textures ship byte-identical with provenance, and `src/sim` cannot import the loader. All nine NPC records now carry the float32 bounding box of their hull's `.dat` vertices, the box Oolite samples for pods and plates. The frozen acceptance run is still 21 of 21.**

## Performance

- **Duration:** about 16 min (2026-11-17T00:05:04Z to 00:21Z)
- **Tasks:** 2 of 2
- **Files:** 24 changed (9 created, 15 modified)

## Accomplishments

- `convert/explosions.ts` compiles `EXPLOSION_KEYS = ["oolite-default-ship-explosion"]` (D16-22). Each absent key takes Oolite's default: alpha 0.85, brightness 1, colour order rgb, count 25, duration 0.9, growth rate 1.5, size 2.5, spread 1 and texture cloud2. A brightness below 1 is raised to 1. A type error, a schema failure or a texture outside `PARTICLE_TEXTURES` fails as a SCHEMA error that names `explosions.plist`, the `<key>.<plist key>` and the entry's line and column. A missing entry fails the same way and names the entry.
- `ExplosionRecordSchema` is a strict object:
  - alpha in 0..1;
  - one of the seven colour orders;
  - count an integer in 1..25;
  - duration and size positive and at most 1e3;
  - growth rate and spread in 0..1e3, brightness in 1..1e3;
  - texture matching `oolite-particle-<name>.png`.

  `ExplosionCatalogueSchema` takes 1 to 16 records with unique keys and requires the default key.
- `loadExplosionCatalogue()` copies `loadDebrisCatalogue`: a non-eager `?raw` glob, a strict `safeParse`, an error that names the path, and one cached promise. Nothing outside `src/content` imports it until plan 16-06, and a test enforces that.
- `PARTICLE_TEXTURES` and `copyParticleTextures` go through the existing `copyNamedTextures`, which compares both digests. `generate.ts` reads `Config/explosions.plist` beside the other configs, emits `explosions.json` and copies the particle textures after the sky textures. The build now writes 121 files.
- `**/content/explosions*` joins the Phase 5 loader denials in `SIM_IMPORT_PATTERNS`. A lint-probe case proves the denial. In a mutation check, removing the line made the probe fail, and the line was restored afterwards.
- `compileNpcShips` and `emitNpcShips` take the parsed `models` record, the same one the masses and radii read. Each record gets `boundingBox` from `boundingBox(mesh)` of its own model, with every component passed through `Math.fround`. A missing mesh fails as a SCHEMA error that names the key and the model, and the lookup uses `Object.hasOwn`.
- `NpcShipSchema.boundingBox` is a strict `{ min, max }` of finite triples, refined so that `min <= max` on every axis. The comments cite `OOEntityWithDrawable.m:55` and `OOVector.m:107-113`.
- ASSETS.md has two `generated-asset` rows, written like the nebula rows. NOTICE gains an `explosions.json` paragraph, a particle-texture sentence and the bounding box in the `ships-npc.json` paragraph.

## The compiled explosion record

| Field | Value | Source |
|-------|-------|--------|
| key | oolite-default-ship-explosion | explosions.plist:3 |
| alpha | 0.8500000238418579 | authored 0.85, float32 (`oo_floatForKey`) |
| colorOrder | rgb | authored |
| count | 25 | authored (the render caps it at 10, D16-08, plan 16-07) |
| duration | 1.5 | authored, `oo_doubleForKey` |
| growthRate | 1.5 | authored, float32 |
| size | 2.5 | authored, float32 |
| spread | 1 | absent, default 1.0 (`OOExplosionCloudEntity.m:86`) |
| brightness | 1 | absent, default `kExplosionBrightnessMult` 1.0 (lines 37, 81-83) |
| texture | oolite-particle-cloud2.png | authored |

Particle textures: `oolite-particle-cloud2.png` (SHA-256 `bf218ba4…0222`) and `oolite-particle-flash.png` (SHA-256 `a3bed39a…d1eb`). Each copy is byte-identical to its vendored file and to its `CHECKSUMS.sha256` entry.

## The nine hull boxes (Oolite model axes, float32)

| Key | Vertices | min [x, y, z] | max [x, y, z] |
|-----|----------|---------------|---------------|
| adder | 1102 | [-14.009300231933594, -5.190680027008057, -22.232799530029297] | [14.009300231933594, 9.70464038848877, 28.952299118041992] |
| cobramk1 | 1117 | [-35, -9.377209663391113, -32.0536003112793] | [35, 8.36658000946045, 34.85029983520508] |
| gecko | 1570 | [-30.737899780273438, -7.4102301597595215, -25.641599655151367] | [30.737899780273438, 7.223869800567627, 25.641599655151367] |
| krait | 1023 | [-47.203800201416016, -11.108799934387207, -41.30690002441406] | [47.203800201416016, 10.684300422668457, 41.50809860229492] |
| mamba | 1112 | [-31.78619956970215, -7.750800132751465, -33.558101654052734] | [31.78619956970215, 7.750800132751465, 33.558101654052734] |
| moray | 1324 | [-29.678300857543945, -14.354700088500977, -34.85070037841797] | [29.678300857543945, 14.354700088500977, 34.85070037841797] |
| shuttle | 477 | [-11.574000358581543, -9.826910018920898, -19.704999923706055] | [11.574000358581543, 9.826910018920898, 19.704999923706055] |
| sidewinder | 1294 | [-31.614599227905273, -7.212170124053955, -22.215499877929688] | [31.614599227905273, 7.212170124053955, 22.215499877929688] |
| viper | 1113 | [-25, -8.790610313415527, -30.165000915527344] | [25, 9.345720291137695, 35.034400939941406] |

The golden pins all nine boxes, more than the Adder and Krait the plan asks for. The values come from an independent scratch Node script under `/tmp` that was mounted into the `test` container. The script parses `NVERTS` and the `VERTEX` lines of each vendored `.dat` itself, rounds each component with `Math.fround` and takes the extremes. It agrees with the converter on all 54 numbers. Every box spans its hull's `MODEL_BOUNDS` entry within the 1e-3 relative tolerance. The only change to `ships-npc.json` is the new key: 108 added lines and no removed ones.

## Task Commits

1. **Task 1 (tracer): the default ship explosion setting and its particle textures, plist to lazy loader** - `3360f85` (feat)
2. **Task 2: every NPC record carries its hull's bounding box** - `79d2bbc` (feat)

Tracer gate: auto mode is on. Task 1's `<verify>` steps (`assets`, the six targeted test files with 88 passing, `assets:check` reporting no differences) passed before Task 2 started, and the targeted explosion tests passed again inside Task 2's run.

## Verification

- `docker compose run --rm assets`: pass, 121 files written (both tasks).
- `docker compose run --rm assets npm run assets:check`: "no differences" (both tasks).
- Task 1 targeted tests (`explosions` converter, `textures`, `tests/content/explosions`, `content-boundary`, `compliance-assets`, `compliance`): 6 files, 88 tests pass.
- Task 2 targeted tests (`npc-ships` converter, `tests/content/ships-npc`, `ships-hulls`, `tests/app/session/traffic`, both compliance files, both explosion files): 8 files, 197 tests pass.
- `docker compose run --rm test` (the full suite with coverage thresholds): 214 files, 5448 passed and 10 skipped, exit 0.
- `docker compose run --rm lint`: eslint clean, prettier clean. `docker compose run --rm typecheck`: pass.
- **QUAL-11 acceptance run (remote, by hand):** `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` at HEAD **79d2bbc**. Result: **21 of 21 passed.** For all 20 epochs, `stuck`, `frozen`, `frustration`, `stationSphere`, `repairs`, `aiFaulted`, `aiDropped`, `hashFailures`, `hullCrossingEpisodes` and `hullCrossingsUnexcused` were all 0. Totals: 40 station, 40 intercept and 40 flee arrivals. Elapsed: 78 s wall clock, 74.8 s vitest. No detector or threshold was touched.
- Not run, by the plan's gate policy (content and lint config only, no browser-facing code): `verify`, `verify-full` and the browser specs.

## Decisions Made

See key-decisions above. No owner-confirmation item (OC-1 to OC-7) is touched by this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Fidelity] `duration` is kept as authored, not stored as float32**
- **Found during:** Task 1
- **Issue:** The action text says "numbers as float32 like the other converters", but `OOExplosionCloudEntity.m:84` reads `duration` with `oo_doubleForKey`. The other keys are read with `oo_floatForKey`.
- **Fix:** `alpha`, `brightness`, `growth_rate`, `size` and `spread` are stored as float32, and `duration` is stored as the authored double, following the C reader. A test pins both (0.1 stays 0.1 and 0.3 becomes `Math.fround(0.3)`). As a result, the behaviour list's "alpha 0.85" appears in the golden as the float32 0.8500000238418579, the value Oolite holds.
- **Commit:** `3360f85`

**2. [Rule 3 - Blocking] The emitted texture tree test now lists the particle textures**
- **Found during:** Task 1
- **Issue:** `textures.test.ts` "the emitted texture tree" pins the exact contents of `public/textures/`.
- **Fix:** It now adds `PARTICLE_TEXTURES` beside `SKY_TEXTURES`.
- **Commit:** `3360f85`

**3. [Rule 2 - Coverage] The golden pins all nine boxes, not only the Adder and the Krait**
- **Found during:** Task 2
- **Issue:** The golden `examples` are whole records compared with `toEqual`, so every example must carry the new field.
- **Fix:** All nine boxes come from the same independent scratch read, and the `sources` note cites the Adder and Krait values.
- **Commit:** `79d2bbc`

**Total deviations:** 3 auto-fixed (1 fidelity, 1 blocking test update, 1 coverage). **Impact:** none of them changes the plan's scope or interfaces.

### Process notes

- The tasks carry `tdd="true"`. As in plans 16-02 to 16-04, each task's tests and implementation went into one commit rather than separate RED and GREEN commits.
- The scratch reader and the acceptance log are under `/tmp/wegolite-1605/`. Nothing was added to the repository or to the image.

## Known Stubs

None. Until plan 16-06 nothing imports `loadExplosionCatalogue` or reads `boundingBox`. This is intentional and enforced by a test.

## Threat Flags

None. T-16-15 (strict schema, bounded count, closed colour orders, texture pattern plus the `PARTICLE_TEXTURES` list, at most 16 records), T-16-16 (finite float32 triples with `min <= max`) and T-16-17 (ESLint denial with a probe) are mitigated as planned and tested. No package was installed (T-16-SC).

## Requirements

- DATA-16: the explosion settings, the particle textures and the hull boxes are compiled with provenance behind the drift gate.
- WORLD-17: advanced. The render inputs exist now. Plans 16-07 to 16-09 draw them and close the requirement.

## Next

Ready for 16-06.

## Self-Check: PASSED

- FOUND: all 9 created files (explosions converter and test, schema, loader, generated file, content test, golden, two PNGs).
- FOUND: `3360f85` and `79d2bbc` are ancestors of HEAD.
- Task 1 acceptance: both files present; `content/explosions` in eslint.config.js 1; `explosions.json` in NOTICE 1; 2 ASSETS.md particle rows; 0 wreckage or fragment entries in `explosions.json`; no importer outside `src/content`.
- Task 2 acceptance: `boundingBox` in the schema 2, in the generated file 9, in the golden 11; `bounding box` in NOTICE 1; the nine boxes and the remote acceptance result with its HEAD are listed above.
