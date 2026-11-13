---
phase: 02-data-pipeline-content-compiler
reviewed: 2026-11-03T13:02:44Z
depth: standard
files_reviewed: 62
files_reviewed_list:
  - AGENTS.md
  - ASSETS.md
  - compose.yaml
  - eslint.config.js
  - NOTICE
  - package.json
  - .prettierignore
  - README.md
  - scripts/check-arch-determinism.sh
  - scripts/vendor-oolite.sh
  - src/content/generated/manifest.json
  - src/content/index.test.ts
  - src/content/index.ts
  - src/content/schemas/commodity.ts
  - src/content/schemas/equipment.ts
  - src/content/schemas/labels.ts
  - src/content/schemas/manifest.ts
  - src/content/schemas/ship.ts
  - src/content/schemas/system.ts
  - src/content/systems.test.ts
  - src/content/systems.ts
  - src/content/types.ts
  - src/main.ts
  - src/vite-env.d.ts
  - tests/compliance-assets.test.ts
  - tests/contract/container-contract.test.ts
  - tests/e2e/models.spec.ts
  - tests/guards/content-boundary.test.ts
  - tests/guards/sim-purity.test.ts
  - tests/guards/tools-determinism.test.ts
  - tools/oolite-ingest/canonical/hash.ts
  - tools/oolite-ingest/canonical/json.ts
  - tools/oolite-ingest/cli.ts
  - tools/oolite-ingest/content-error.ts
  - tools/oolite-ingest/convert/commodities.test.ts
  - tools/oolite-ingest/convert/commodities.ts
  - tools/oolite-ingest/convert/dat.test.ts
  - tools/oolite-ingest/convert/dat.ts
  - tools/oolite-ingest/convert/equipment.test.ts
  - tools/oolite-ingest/convert/equipment.ts
  - tools/oolite-ingest/convert/glb.test.ts
  - tools/oolite-ingest/convert/glb.ts
  - tools/oolite-ingest/convert/labels.test.ts
  - tools/oolite-ingest/convert/labels.ts
  - tools/oolite-ingest/convert/ships.test.ts
  - tools/oolite-ingest/convert/ships.ts
  - tools/oolite-ingest/convert/systems.test.ts
  - tools/oolite-ingest/convert/systems.ts
  - tools/oolite-ingest/convert/textures.test.ts
  - tools/oolite-ingest/convert/textures.ts
  - tools/oolite-ingest/drift.test.ts
  - tools/oolite-ingest/failure-contract.test.ts
  - tools/oolite-ingest/generate.ts
  - tools/oolite-ingest/like-ship.test.ts
  - tools/oolite-ingest/like-ship.ts
  - tools/oolite-ingest/manifest.ts
  - tools/oolite-ingest/openstep/parser.test.ts
  - tools/oolite-ingest/openstep/parser.ts
  - tools/oolite-ingest/openstep/plist-value.ts
  - tools/oolite-ingest/openstep/tokenizer.ts
  - tsconfig.json
  - vitest.config.ts
findings:
  critical: 1
  warning: 8
  info: 6
  total: 15
  necessity: 0
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-11-03T13:02:44Z
**Depth:** standard
**Files Reviewed:** 62
**Status:** issues_found

## Summary

Static review of the 62 submitted files, plus direct inspection of the committed
artefacts those files produce (`src/content/generated/manifest.json`,
`ASSETS.md`, `public/`, `third_party/oolite/`), with `Dockerfile`,
`vite.config.ts`, `tsconfig.sim.json` and `tests/compliance.test.ts` read for
context. No test or `verify` run was performed in this review session; every
finding below is proven from source, committed bytes or data I re-read myself.

The compiler core is careful work: the OpenStep tokenizer/parser are total and
position-reporting, `like_ship` resolution is memoised, cycle-safe and
order-independent (with a property test and a verified cross-check against
`OOShipRegistry.m` semantics recorded in `02-RESEARCH.md`), the `.dat` reader
range-checks before allocating, the GLB writer writes little-endian explicitly
and derives accessor bounds from the emitted float32 buffer, and the drift gate
in `cli.ts` reports missing/extra/changed-bytes/changed-hash rather than trusting
a manifest alone. The values I re-derived myself from the pinned inputs are
correct (Lave `g0-s7` field-by-field against `planetinfo.plist`, the Cobra
`cobra3-player`/`cobra3-trader` stats against `shipdata.plist`, `labels.json`
template counts, `manifest.json` row hashes), and the committed
`public/textures/*.png` copies are byte-identical to their vendored originals.

What is *not* sound is the provenance layer around the generated output, and
several gates that claim a stronger guarantee than the code actually enforces.

## Narrative Findings (AI reviewer)

All findings below are my own, from reading the current source and re-reading the
committed data. No external-reviewer evidence was supplied for this run.

## Critical Issues

### CR-01: 16 committed assets have malformed ASSETS.md rows — no licence, origin or hash

**File:** `ASSETS.md:87-102`
**Issue:** The 16 copied textures under `public/textures/` are committed,
redistributed CC BY-NC-SA 3.0 artwork, and each has a row that contains only a
path cell:

```
| public/textures/oolite_cobra3_diffuse.png                          |
```

There is no `Kind`, `Origin`, `Source URL`, `Author / Copyright`, `Licence`,
`Modifications` or `SHA-256` cell — the rows are not rows in the table's own
8-column contract (`tests/compliance-assets.test.ts:29-30`). This contradicts
three committed statements: `AGENTS.md` non-negotiable #4 ("Never add an asset
without recording its provenance in `NOTICE`/`ASSETS.md`"), `NOTICE:40-42`
("Every reused asset ... is recorded, with its origin and licence, in
`ASSETS.md`"), and `README.md:69-72` ("Every vendored **and generated** asset has
a row with a SHA-256 in `ASSETS.md`"). The two GLBs and the five baked emissive
maps immediately above (lines 80-86) do carry full rows, so the omission is an
oversight rather than a policy choice.

Mitigating fact, stated honestly: the same bytes are fully provenanced under
`third_party/oolite/Textures/<name>`, and I verified each copy is byte-identical
to that vendored file, so the licence information is recoverable. What is broken
is the record the project itself designates as authoritative for every committed
asset, and the hashes have to be recomputed by hand (`vendor-oolite.sh` only
rewrites `third_party/oolite/` rows, so nothing maintains the `public/` rows).

**Fix:** complete each row with the vendored identity and the copy's own digest.
Kind `generated-asset`, Origin `Oolite 1.93.1-241 @ 7437f22`, Source URL
`https://raw.githubusercontent.com/OoliteProject/oolite/7437f22/Resources/Textures/<name>`,
Author `Oolite contributors`, Licence `CC BY-NC-SA 3.0`, Modifications
`none: byte-identical copy of the vendored texture`, and these SHA-256 values
(verified against both the committed copy and the vendored source):

```
oolite_cobra3_diffuse.png                    348a0f9394baba4ec1ac0a37a775850e964d496078e5c4f136c479425eb4aa11
oolite_cobra3_normal.png                     fd3f733f97c406f418880352825b92720fedff9951200aca918fa710eba3daa6
oolite_cobra3_specular.png                   4dc706d2ceb93093c27b000fa03834557e91a08fbc636a567b032cee61ac9798
oolite_cobra3_subents.png                    be0dedb1d34d3425b1f7a92d2ac56f174938f8157aab56509e227bba26721da5
oolite_cobra3_subents_normal.png             13607e4bb2b8ac69a83a2af86d4326786ecd8dcaee103ba1ec63a47932c64670
oolite_coriolis_diffuse.png                  4d37a45710fd88798b7ff5a109e6b1fc0a9088166f05fc66a28540a31eaabf13
oolite_coriolis_dock_diffuse.png             64bda5ab0b7c00548d6ce335de4d4de63156f4507ab8ce8352adfd15fa490693
oolite_coriolis_dock_normal.png              9863395167650e295669c831a9bc57d6ba3c0a27de8ffe7add87c9d4a17250b7
oolite_coriolis_faceplate_diffuse.png        9edd6dee6d90101e55392c6897b395846519d16d21503bc229846d3a5511188a
oolite_coriolis_faceplate_normal.png         3908e10c05211bb66b7c6deb675de79b91a7fc7dae3f0259fec5c0ea5b55ab3a
oolite_coriolis_faceplate_specular.png       0125056880902023aba4cc20c3b273bba184f445d661fe1ef9ab3873770bd353
oolite_coriolis_normal.png                   c051af90ea73c2318b3104ee5110e619de5195ed9a41a982e1a73b90f136ecf4
oolite_coriolis_specular.png                 5f46f01778043d81434396fb7eca492ea8e3bf7d0158be22377292a88c001036
oolite_coriolis_tris_diffuse.png             729917a5f1c32d1f8cb9fd52788131ad713a6d8a2284e956d224ca2b5901088f
oolite_coriolis_tris_normal.png              c6aecd20e89e6373b3c1734ed04f1cfc1043864e485132b25fb2766640fa47b5
oolite_coriolis_tris_specular.png            281ada9fa9ece3a36adc0bd905ac0366f88ae83afacc548174cc42f3997c50a7
```

Also decide explicitly whether the derived `src/content/generated/*.json` files
(compiled from CC BY-NC-SA configuration) need rows; `NOTICE:29-35` calls
configuration-file derivatives CC BY-NC-SA, yet no generated JSON appears in the
table either.

## Warnings

### WR-01: The asset-compliance gate cannot see generated or malformed rows

**File:** `tests/compliance-assets.test.ts:64-80,95`
**Issue:** `parseAssetRows` silently discards any line whose cell count is not
exactly 8 (`if (cells.length !== 8) return;`, line 74), and `FILES` is
`collectFiles("third_party/oolite")` only. Combined, this means the 16 broken
`public/textures/*` rows from CR-01 — and any future `public/models/**` or
emissive-map row that loses a cell or a hash — are invisible to the very test the
file header describes as proving "three sources must agree". The suite's
mismatch reporting is airtight *for vendored files*, but the class of assets this
phase adds (generated GLBs, copied and baked textures) is outside its walk
entirely, so a missing or stale hash on a generated asset can ship green.
**Fix:** walk `public/models`, `public/textures` and `src/content/generated`
too, assert one row per committed file (and no orphan rows), and make a
`|`-prefixed line with a non-8 cell count a hard failure instead of an ignored
line. Keep the vacuity guard, and add the generated roots to it.

### WR-02: The sim content boundary is a denylist, so `src/content/systems.ts` is an open runtime door

**File:** `eslint.config.js:82-95`
**Issue:** The sim zone's `no-restricted-imports` group denies `**/content/index*`,
`**/content/schemas/**` and `**/content/generated/**`, while the accompanying
message (line 96) and `tests/guards/content-boundary.test.ts:12-16` state that the
sim "may only import src/sim and content/types". That allowlist is not what the
rule implements. No pattern matches `src/content/systems.ts`, which is a runtime
module that pulls eight generated JSON chunks in through
`import.meta.glob(..., { query: "?raw" })` (`src/content/systems.ts:55-80`). A sim
file can therefore write
`import { loadGalaxy } from "../content/systems.js"` and `eslint` stays green,
dragging generated content and a Vite-only bundler feature into the purity zone.
`tsc -p tsconfig.sim.json` would reject the glob (vite/client types are excluded
via `types: []`), so that gate partially mitigates — but the ESLint zone is
documented as the independent owner of the boundary, and a future
`src/content/<anything>.ts` without Vite syntax would pass both.
**Fix:** invert the rule to an allowlist, e.g. `no-restricted-imports` `patterns`
with `{ group: ["../content/*", "**/content/**"], message: ... }` plus
`ignore`-style allowance for `content/types`, or add a `no-restricted-syntax`
selector for `ImportDeclaration` whose specifier does not begin with `./`/`../sim`
and does not resolve to `content/types`. Add the negative probe to
`tests/guards/content-boundary.test.ts`.

### WR-03: The determinism lint zone omits most of the class it claims to ban

**File:** `eslint.config.js:141-218`
**Issue:** The comment states that the safe surface — `+ - * /`, `Math.sqrt`,
`min`/`max`/`abs`/`floor`/`round`/`ceil`, `Math.imul`, `Math.fround` — is
"deliberately left unrestricted", i.e. everything else in the 1-ULP class is
banned. The actual list bans only `Math.sin`, `cos`, `tan`, `exp`, `log`, `pow`,
`random` and `Date.now`/`Intl`/`localeCompare`/`toFixed`/`toPrecision`. Still
allowed and equally implementation-approximated by ECMAScript:
`Math.asin`, `acos`, `atan`, `atan2`, `cbrt`, `hypot`, `expm1`, `log1p`, `log2`,
`log10`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`,
`Number.prototype.toExponential`, and the `toLocaleString` family (only the
`Intl` global and `localeCompare` are denied). Any of these can be introduced into
`tools/oolite-ingest/` today without a lint failure, which is exactly the
"one call makes the committed bytes machine-dependent" failure
`tests/guards/tools-determinism.test.ts` exists to prevent.
**Fix:** extend the `no-restricted-properties` Math list to every
implementation-approximated member (a single loop over a name array keeps it
readable), add `toExponential`/`toLocaleString` to `no-restricted-syntax`, and add
at least `Math.atan2`/`Math.hypot` negative probes to the guard test so the list
can't regress.

### WR-04: A string-form `emission_map` is silently dropped instead of failing the build

**File:** `tools/oolite-ingest/convert/glb.ts:719-727,737` (same asymmetry at
`tools/oolite-ingest/convert/textures.ts:183-193`)
**Issue:** `diffuse_map`, `normal_map` and `specular_map` are read with
`asString(...)`, which accepts the plain-filename form Oolite uses. `emission_map`
is only read when it is an object:

```ts
const emissionMap = config.emission_map;
const emissionName =
  typeof emissionMap === "object" && emissionMap !== null
    ? asString((emissionMap as Record<string, unknown>).name)
    : null;
```

Oolite accepts a bare filename too — `third_party/oolite/Config/shipdata.plist:1037`
and `:1165` author `emission_map = "oolite_buoy_illumination.png";`. For those
entries `materialFor` emits `emissiveTexture: null` and
`resolveReferencedTextures` records no emission, so if such a ship is ever added
to `EMITTED_ENTRIES` the GLB is produced successfully with **no** emissive map and
no `TEXTURE_MISSING` failure — the exact silent stand-in the module documents
(D-21: "never a silent stand-in texture") and the whole-hull-glow/absent-glow
class D-08 is protecting against. The five GLBs' emissive maps that ship today are
correct because every one of those entries uses the dictionary form.
**Fix:** read `emission_map` as `asString(emissionMap)` when it is a string,
otherwise take `.name`; in the string case treat `extract_channel` as `"a"` (the
documented default) or refuse with `SCHEMA` if the channel cannot be inferred.
Apply the same helper in `resolveReferencedTextures` so the closure and the
material agree.

### WR-05: The CLI's entry-point check fails open — a drift check that does not run exits 0

**File:** `tools/oolite-ingest/cli.ts:279-285`
**Issue:**

```ts
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await run();
}
```

`resolve(entry)` is a lexical path, while `import.meta.url` is the loader's
module URL (Node realpaths symlinked modules unless `--preserve-symlinks` is
set). If the repository is reached through a symlinked path — a symlinked home
directory, a bind-mount path that differs from the real path, a wrapper script —
the comparison is false, `run()` never executes, nothing is printed and the
process exits **0**. `docker compose run --rm verify` runs `npm run assets:check`
third in its `&&` chain, so that state is recorded as a pass while no comparison
happened. This is the one gate whose entire purpose is to fail loudly.
**Fix:** keep the import-safe guard for tests, but make the non-entry path
explicit rather than silent — e.g. export `main` only, move the `run()` call to a
tiny entry module that the package script names, or, when `argv[1]` resolves to a
file whose basename matches this module but the URLs differ, print a diagnostic
and `process.exitCode = 2`. Add a test that spawns the CLI through a symlinked
path.

### WR-06: The cross-arch script's cleanup can turn a pass into exit 1 on Linux

**File:** `scripts/check-arch-determinism.sh:47-50,110-128`
**Issue:** `tmp=$(mktemp -d)` and each `$tmp/out-<arch>` are created by the
invoking user, but the trees *inside* `out-<arch>` (`src/…`, `public/…`) are
written by `docker run` **as root** into `-v "$out:/out"`. On a Linux host (the
documented CI target) those nested directories are root-owned `0755`, so the
plain user cannot unlink the entries inside them: `rm -rf "$tmp"` in the `EXIT`
trap removes the top level and then fails with "Permission denied". The script
runs under `set -eu`, so a failing trap command makes the shell exit non-zero —
a byte-identical run prints `arm64 and amd64 output are byte-identical (N files)`
and then reports failure. It also leaves the root-owned subtrees behind on every
run, so repeated invocations accumulate them in `/tmp`.
**Fix:** run the container as the caller (`--user "$(id -u):$(id -g)"`, keeping
`HOME` writable for zlib/tsx caches), or `chown -R` the output inside the
container before it exits, and make the trap non-fatal:
`trap 'rm -rf "$tmp" 2>/dev/null || true' EXIT`.

### WR-07: The arm64↔amd64 byte-identity claim is never executed anywhere

**File:** `scripts/check-arch-determinism.sh:34-41` (with `README.md:64-68`)
**Issue:** The script is deliberately outside `verify`, and its own header
records `Result: not yet measured`. That would be fine if some other runner
executed it, but the repository has no `.github/` directory and no other file
references the script (grep across the tree finds only the script itself plus the
README/AGENTS prose), so nothing ever runs it. `README.md` nevertheless presents
"Cross-architecture proof" as a property of the pipeline and `AGENTS.md` requires
`tools/oolite-ingest/**` to be byte-deterministic. The only evidenced determinism
is therefore same-host `assets:check`, and `DATA-08`'s cross-arch half is an
unverified claim in the committed documentation.
**Fix:** add the smallest CI job that can run it (an arm64-capable runner, or a
`linux/amd64` runner with QEMU binfmt and the script invoked with
`--platform` support), or record the pending state as a tracked task and soften
the README wording until the result is measured and written onto the header line
the script reserves for it.

### WR-08: Generation writes output before the texture closure is asserted

**File:** `tools/oolite-ingest/generate.ts:133-157`
**Issue:** `generateContent` builds all in-memory emitters, writes every JSON and
GLB file to `outRoot` (lines 142-146), and only then calls `copyTextures` and
`emitTextures`; `emitTextures` is where `resolveReferencedTextures` performs the
allowlist closure assertion. So in `assets:build` mode a `diffuse_map` (or
`normal_map`/`specular_map`) that escapes the texture allowlist — including a
traversal name — is already serialised into `public/models/coriolis.glb` as
`../textures/../../…` before the build fails with `TEXTURE_MISSING`, and the
tree is left with new GLBs and old (or absent) `manifest.json`. Nothing marks the
tree dirty; the next `assets:check` will report drift, but a developer following
"regenerate, review, commit" can be looking at a half-written, unreviewable diff.
`--check` is safe because it writes to `mkdtemp`.
**Fix:** call `resolveReferencedTextures(catalogue)` (and the emission-source
resolution) before the write loop, or stage every emitted byte in memory and
write only after all emitters and both texture passes have succeeded. At minimum,
validate texture names in `materialFor` itself so no unvalidated name can reach a
GLB buffer.

## Info

### IN-01: `CONTENT_MANIFEST_SCHEMA_VERSION` is dead, so "bump the version" is a trap

**File:** `src/content/index.ts:20-21`, `src/content/schemas/manifest.ts:30`
**Issue:** `CONTENT_MANIFEST_SCHEMA_VERSION = 1` is exported as "The manifest
version this build understands" but is never read; the actual gate is the
hardcoded `schemaVersion: z.literal(1)`. A future author who bumps the constant
gets no behaviour change and no failure.
**Fix:** derive the literal from the constant (`schemaVersion: z.literal(CONTENT_MANIFEST_SCHEMA_VERSION)`)
or delete the constant.

### IN-02: Dead re-exports in the systems converter

**File:** `tools/oolite-ingest/convert/systems.ts:490`
**Issue:** `export { COLOUR_KEYS, VECTOR_KEYS, SYSTEM_KEY, NON_SYSTEM_KEYS }` is
documented as "exported for assertions", but no test imports any of them —
`convert/systems.test.ts:33-48` redeclares its own `COLOUR_KEYS`/`VECTOR_KEYS`
(and with the *camelCase* projected names, so the two lists are not even the same
thing). The export misleads about which list is authoritative.
**Fix:** delete the re-export (the constants stay module-private), or have the
test import the real list and delete its copy.

### IN-03: Subentity projection uses first-match where the rest of the pipeline is last-wins

**File:** `tools/oolite-ingest/convert/ships.ts:292,296`
**Issue:** `projectSubentity` reads `is_dock` and `position` with
`value.entries.find(...)` (first match), while `plistToJson`, `dictToMap` and
`getEntry` all implement GNUstep's last-wins rule, and the parser deliberately
retains duplicate keys. For a subentity that repeats either key, `extras` and the
typed field would disagree, with no diagnostic.
**Fix:** use `getEntry(value, "is_dock")?.value` / `getEntry(value, "position")?.value`
from `openstep/plist-value.ts` so both projections share one rule.

### IN-04: The ship lookup table is a plain object keyed by authored ship keys

**File:** `tools/oolite-ingest/generate.ts:128-131`
**Issue:** `const entries: Record<string, ShipEntry> = {}` then
`entries[entry.key] = …`. Every other keyed store in the phase uses `Map`
precisely to keep `__proto__` as data (`like-ship.ts:30-32`,
`plist-value.ts:87-98`). Here a shipdata key of `__proto__` would assign the
prototype instead of an own property, and a key such as `constructor` or
`toString` would collide with an inherited `Object.prototype` property at the
`requireEntry` lookup (`glb.ts:947-956` checks `!== undefined`, so it would pass
and crash later on `.shipDef`).
**Fix:** build a `Map<string, ShipEntry>` and change `requireEntry`/`emitModels`
to take a `ReadonlyMap`.

### IN-05: Unreachable branch in the tokenizer

**File:** `tools/oolite-ingest/openstep/tokenizer.ts:231-238`
**Issue:** The bare-token loop breaks on whitespace, punctuation or `"`, all of
which are consumed by earlier branches, and the outer `while (index < source.length)`
guarantees at least one character is available, so `value` can never be `""` and
the `fail("token", …)` branch is dead. It is defensive but untested and reads as
if a real malformed-input case existed.
**Fix:** replace the branch with an `if (value.length === 0) throw new Error(…)`
invariant, or delete it and note why the loop always consumes one character.

### IN-06: `emissionModulateColorNormalized` is not normalised for the Coriolis

**File:** `tools/oolite-ingest/convert/glb.ts:650-670` (value at
`public/models/coriolis.glb` extras)
**Issue:** `normalizedColour` implements Oolite's rule "divide the whole triple by
255 when any component exceeds 1", so the Coriolis hull's authored
`{red: 6750.952, green: 6780.963, blue: 3280.8824}` becomes
`[26.474, 26.592, 12.866]` — a field named `…Normalized` that is 26× out of
range. `glb.test.ts:991-998` pins that value. A Phase 3 consumer that multiplies
by the "normalised" triple without clamping gets a saturating white hull.
**Fix:** rename to `emissionModulateColorOolite` (or add a
`emissionModulateColorClamped` in [0,1] alongside it) and state in the extras
contract that the value is Oolite's post-rescale triple, which may still exceed 1.

---

_Reviewed: 2026-11-03T13:02:44Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
