---
phase: 02-data-pipeline-content-compiler
plan: 01
subsystem: content-pipeline
tags:
  - openstep
  - plist
  - zod
  - tsx
  - canonical-json
  - sha256
  - drift-gate
  - docker

requires:
  - phase: 01-foundation-containers-compliance
    provides: Docker-only verify chain, strict TypeScript/ESLint gates, golden-fixture pattern, ASSETS.md provenance table

provides:
  - pinned Oolite snapshot at 1.93.1-241 / 7437f22 with script-generated CHECKSUMS.sha256, pin.json and ASSETS.md hashes
  - in-repo OpenStep tokenizer and recursive-descent parser with line/column tracking
  - structured ContentError contract (code/file/construct/line/column/excerpt)
  - canonical JSON serialiser and SHA-256 helper
  - content manifest with per-file bytes and hashes
  - assets Compose service plus assets:build / assets:check, wired third into verify
  - 17 typed commodity records with units, decicredit prices and authored ratios

affects:
  - 02-02 parser completeness
  - 02-03 systems and equipment
  - 02-05 shipdata catalogue
  - 05 economy and station screens

actuals:
  tokens: 25300
  tasks: 3
  commits: 4

tech-stack:
  added:
    - zod@4.6.7 (runtime/build schema source of truth)
    - tsx@4.23.15 (runs the TypeScript CLI)
    - fast-check@4.10.2 (installed for plan 02's property tests; unused here)
    - "@gltf-transform/core@4.5.1 (installed as a test-only GLB reader; unused here)"
  patterns:
    - canonical JSON instead of JSON.stringify
    - one structured ContentError for every failure class
    - generator output gated by regeneration into mkdtemp
    - provenance hashes written by the tool, never typed

key-files:
  created:
    - third_party/oolite/Config/trade-goods.plist
    - third_party/oolite/CHECKSUMS.sha256
    - third_party/oolite/pin.json
    - third_party/oolite/SOURCE.md
    - third_party/oolite/LICENSE-oolite.txt
    - scripts/vendor-oolite.sh
    - tools/oolite-ingest/content-error.ts
    - tools/oolite-ingest/openstep/plist-value.ts
    - tools/oolite-ingest/openstep/tokenizer.ts
    - tools/oolite-ingest/openstep/parser.ts
    - tools/oolite-ingest/canonical/json.ts
    - tools/oolite-ingest/canonical/hash.ts
    - tools/oolite-ingest/manifest.ts
    - tools/oolite-ingest/generate.ts
    - tools/oolite-ingest/cli.ts
    - tools/oolite-ingest/convert/commodities.ts
    - tools/oolite-ingest/convert/commodities.test.ts
    - tools/oolite-ingest/drift.test.ts
    - src/content/schemas/commodity.ts
    - src/content/generated/commodities.json
    - src/content/generated/manifest.json
    - tests/golden/content/commodities.json
  modified:
    - package.json
    - package-lock.json
    - compose.yaml
    - vitest.config.ts
    - .prettierignore
    - tests/contract/container-contract.test.ts
    - AGENTS.md
    - README.md
    - ASSETS.md

key-decisions:
  - "Dictionaries are entry arrays, never objects keyed by plist key, so __proto__ cannot reach a prototype and integer-like keys cannot be reordered."
  - "The manifest stores repository-relative paths, so one row identifies a file in either the committed tree or the mkdtemp regeneration."
  - "podConversion carries kilogramsPerUnit as metadata and is never applied; Phase 5 owns conversion."
  - "tradeable is false only for alien_items, asserted as exactly one record."

patterns-established:
  - "Canonical output: sorted code-unit keys, String(n) numbers, two-space indent, LF, final newline, literal UTF-8."
  - "Drift gate: regenerate into mkdtemp, compare file set + bytes + manifest hash, one label per path, cleanup in finally."
  - "Provenance: the vendor script computes every hash from the bytes it wrote, including CHECKSUMS.sha256's own row."

requirements-completed: [DATA-01, DATA-04, DATA-06, DATA-08, DATA-09]

coverage:
  - id: D1
    description: "Pinned Oolite snapshot vendored with generated CHECKSUMS.sha256, pin.json and matching ASSETS.md hashes; a re-run changes no byte."
    requirement: DATA-09
    verification:
      - kind: other
        ref: "docker compose run --rm assets sh scripts/vendor-oolite.sh (run twice; sha256sum -c unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "OpenStep tokenizer/parser reads trade-goods.plist: comments, quoted keys, nested dict/array, bare atoms, integer/real/bool resolution, line/column positions."
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/commodities.test.ts#emits the pinned 17-record array"
        status: pass
    human_judgment: false
  - id: D3
    description: "Canonical JSON serialiser plus content manifest format/schemaVersion/oolite pin/files[] with SHA-256 rows."
    requirement: DATA-04
    verification:
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
    human_judgment: false
  - id: D4
    description: "Drift gate classifies CHANGED bytes, MISSING, EXTRA and CHANGED hash, naming each file, with no override."
    requirement: DATA-08
    verification:
      - kind: integration
        ref: "tools/oolite-ingest/drift.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "All 17 commodities as typed records: t/kg/g units, integer decicredit priceAverage, authored-precision ratios, alien_items present but untradeable."
    requirement: DATA-06
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/convert/commodities.test.ts"
        status: pass
      - kind: other
        ref: "tests/golden/content/commodities.json"
        status: pass
    human_judgment: false
  - id: D6
    description: "assets Compose service, assets:build/assets:check scripts, verify chain with assets:check third, and both command guides updated."
    verification:
      - kind: integration
        ref: "tests/contract/container-contract.test.ts"
        status: pass
      - kind: other
        ref: "docker compose run --rm verify"
        status: pass
    human_judgment: false
  - id: D7
    description: "Generation is deterministic: a second assets build changes no byte."
    requirement: DATA-08
    verification:
      - kind: other
        ref: "sha256sum src/content/generated/*.json before/after two docker compose run --rm assets"
        status: pass
    human_judgment: false
  - id: D8
    description: "Four new package pins approved by a human before install, with no fifth package added."
    verification: []
    human_judgment: true
    rationale: "Package legitimacy is an external trust decision (npm registry identity and install scripts) that no in-repo test can establish."

duration: 12 min
completed: 2026-11-03
status: complete

plan_head_before: 4e6fd5f507e6b0fd292025a9cd060f1bf2886ff7
plan_head_after: 51c086f
commits: 4
---

# Phase 2 Plan 01: Content Pipeline Tracer Summary

**Pinned Oolite snapshot compiled through an in-repo OpenStep parser into canonical, drifted-gated typed content: all 17 commodities emitted, with `assets:check` third in `verify`.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-03T10:56:10Z
- **Completed:** 2026-11-03T11:07:51Z
- **Tasks:** 3 (1 approval gate + 2 implementation tasks)
- **Files modified:** 31

## Task 1 — package legitimacy approval (checkpoint:human-verify)

Presented to the human before dispatch with npm registry evidence for all four pins (version exists, source repository, no `postinstall`).

- **Response (verbatim):** `approved` — "Approve — install all four".
- **Approved pins:** `zod@4.6.7`, `tsx@4.23.15`, `fast-check@4.10.2`, `@gltf-transform/core@4.5.1`.
- **Constraint:** no fifth package was approved. No other dependency was added.
- **Installed as:** `zod` in `dependencies`; the other three in `devDependencies`; every version bare `x.y.z`.

## Task 2 — end-to-end tracer

Vendored `Config/trade-goods.plist` at commit `7437f22` through `scripts/vendor-oolite.sh`, which also writes `CHECKSUMS.sha256`, `pin.json` and the `ASSETS.md` SHA-256 cells. Built the OpenStep tokenizer/parser, canonical JSON, SHA-256 helper, manifest and CLI, wired the `assets` service and `assets:check` into `verify`, and emitted a thin 17-record tracer.

## Task 3 — typed commodity projection and negative proofs

Added `src/content/schemas/commodity.ts` (strict zod, `z.infer` types) and `convert/commodities.ts` with the full projection: `t`/`kg`/`g` units from `quantity_unit`, integer decicredit `priceAverage`, five authored-real ratios, pod metadata carried but never applied, ascending `sort_order`, and `alien_items` present with zero quantities and `tradeable: false`. Added the generated golden and the drift-gate negative proofs.

## Accomplishments

- One build command regenerates `commodities.json` and `manifest.json` from the single vendored plist; a second run changes no byte.
- `docker compose run --rm verify` is green in the exact order `lint → typecheck → assets:check → test → build → test:e2e`.
- `assets:check` proves `CHANGED bytes`, `MISSING`, `EXTRA` and `CHANGED hash`, each naming the offending path, with no override.
- All 17 commodities carry integer decicredits, authored decimals (`food.quantityAverage === 13.5`, `priceEconomic === 0.55`) and correct units (`gold`/`platinum` kg, `gem_stones` g).
- Every vendored file has an `ASSETS.md` row whose digest the vendor script computed from the bytes it wrote.

## Task Commits

1. **Task 2: tracer** — `6d9dd94` (feat)
2. **Task 3 RED: goldens + drift proofs** — `015e8f4` (test)
3. **Task 3 GREEN: typed projection** — `abfa922` (feat)
4. **Vendor-script fix found during idempotence check** — `51c086f` (fix)

## Files Created/Modified

See the frontmatter `key-files` block. The load-bearing ones:

- `tools/oolite-ingest/openstep/{tokenizer,parser,plist-value}.ts` — the grammar and AST.
- `tools/oolite-ingest/canonical/{json,hash}.ts` — one serialiser and one hash.
- `tools/oolite-ingest/{generate,cli,manifest}.ts` — emitters, path guards, drift report.
- `tools/oolite-ingest/convert/commodities.ts` + `src/content/schemas/commodity.ts` — the typed projection.
- `scripts/vendor-oolite.sh` — the single provenance authority.
- `compose.yaml`, `package.json`, `vitest.config.ts`, `.prettierignore`, `tests/contract/container-contract.test.ts`, `AGENTS.md`, `README.md` — the coupling edits that had to land with it.

## Decisions Made

- Repository-relative manifest paths (`src/content/generated/commodities.json`) rather than paths relative to the generated directory: one row identifies the file in both the committed tree and the `mkdtemp` regeneration.
- `podConversion.kilogramsPerUnit` is carried metadata (`t: 1000`, `kg: 1`, `g: 0.001`) and is never applied; Phase 5 owns conversion.
- C-style escapes (including octal) were implemented now, a superset of what `trade-goods.plist` needs, so plan 02's corpus fixtures are not blocked on tokenizer work.
- A comment-only or empty file parses to an explicit empty dictionary node, distinct from a parse failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Vendor script did not recognise Prettier-padded ASSETS.md rows**
- **Found during:** final idempotence check (a second vendor run)
- **Issue:** `prettier --write` aligns table cells, so a path cell is followed by padding spaces. The row regex required a single space before the pipe and reported "no ASSETS.md row" for every padded row — breaking the plan's "a re-run changes no byte" truth.
- **Fix:** the row pattern now trims padding (`^\|\s*(third_party\/oolite\/[^|]+?)\s*\|`), and the SHA-256 cell rewrite tolerates trailing padding.
- **Files modified:** `scripts/vendor-oolite.sh`
- **Verification:** two further vendor runs exit 0; `sha256sum -c` over `ASSETS.md`, `pin.json` and `CHECKSUMS.sha256` is unchanged; `git status` is clean for `third_party` and `ASSETS.md`.
- **Committed in:** `51c086f`

### Process adaptations

**2. TDD RED scope**
- Task 2's `--check` contract required exporting `checkAssets` with its report classification, so the three gate cases were already green when task 3's tests were written. The RED commit (`015e8f4`) therefore proves the projection RED (the converter and schema modules are absent) while the drift tests were green at that commit. The plan's literal "the `checkAssets` report does not exist yet" was not reproducible without breaking task 2's acceptance criteria.

**3. Task 1 produced no commit**
- The approval gate changes no file; its evidence is recorded here and in the install commit `6d9dd94`.

---

**Total deviations:** 1 auto-fixed (Rule 1) + 2 process adaptations.
**Impact on plan:** the fix was required for the plan's own idempotence truth; the TDD adaptation changed commit granularity, not behaviour. No scope creep.

## Issues Encountered

- The container writes generated content as root, which left `src/content/` non-writable for the host user. Fixed with a one-off `chown` inside the container; no repository change.
- `npm install` reported 12 moderate audit findings in the inherited dependency tree (all pre-existing transitive packages) and a blocked `esbuild` postinstall notice; `tsx v4.23.15` runs correctly in the rebuilt image, so no action was taken.
- The Vite build emits its existing "chunk larger than 500 kB" advisory; unrelated to this plan.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- Plan 02 can extend the parser over all 40 config plists; the tokenizer already decodes octal/`\b`/`\177` escapes, and duplicate keys resolve last-wins through `dictToMap`/`getEntry`.
- Every later converter plugs into `generateContent`, `canonicalJson`, `buildManifest` and `checkAssets` without touching the Compose wiring.
- Known open item for later plans: the parser is proven on `trade-goods.plist` only; full-corpus grammar coverage and the located-failure fixtures are plan 02's scope.

---

## Self-Check: PASSED

- [x] `third_party/oolite/*`, `tools/oolite-ingest/**`, `src/content/generated/*`, `tests/golden/content/commodities.json` exist and are committed.
- [x] Four commits exist on this branch (`6d9dd94`, `015e8f4`, `abfa922`, `51c086f`).
- [x] `docker compose run --rm verify` exits 0 with the exact six-stage chain.
- [x] `docker compose run --rm assets npm run assets:check` exits 0; two consecutive builds change no byte.
- [x] `git status --porcelain src/content/generated third_party` is empty after a build.
- [x] `grep -rn "Math.random\|Date.now\|new Date\|toFixed\|localeCompare\|Intl\." tools/oolite-ingest/` returns nothing.

*Phase: 02-data-pipeline-content-compiler*
*Completed: 2026-11-03*
