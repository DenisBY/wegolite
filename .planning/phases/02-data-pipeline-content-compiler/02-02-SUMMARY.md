---
phase: 02-data-pipeline-content-compiler
plan: 02
subsystem: content-pipeline
tags:
  - openstep
  - plist
  - parser
  - property-testing
  - fast-check
  - failure-contract
  - vendoring
  - sha256
  - docker

requires:
  - phase: 02-data-pipeline-content-compiler
    provides: Plan 01's tokenizer/parser, ContentError contract, canonical JSON, vendor script and assets service
  - phase: 01-foundation-containers-compliance
    provides: Docker-only verify chain, strict TypeScript/ESLint gates, ASSETS.md provenance table

provides:
  - OpenStep tokenizer/parser complete for the entire pinned Config corpus (40 files, 31 dict / 9 array roots)
  - C escapes and octal escapes (\\007, \\030, \\177, \\b) decoded to the exact authored code points
  - duplicate keys retained in AST source order and resolved last-wins at lookup
  - quoted keys containing spaces, bare, bool, integer and real classification with no silent coercion
  - null-prototype dictionary projection so a __proto__ key can never reach a prototype
  - four failure-class fixtures plus PLIST_PARSE and SCHEMA assertions with code/file/construct/position
  - fast-check total-function property and canonical round-trip over all 40 vendored plists
  - all 40 pinned Config plists vendored with CHECKSUMS rows and ASSETS.md provenance

affects:
  - 02-03 systems and equipment converters
  - 02-05 shipdata catalogue
  - every later converter that trusts parseOpenStep's error contract

actuals:
  # chars/4 over the authored diff; the 3.5 MB vendored plist payload is
  # excluded because the plan estimate models authored work, not copied bytes.
  tokens: 13400
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - Character-scanner tokenizer with 1-based line/column on every token
    - Entry-array dictionaries plus Map lookup, never a plain object keyed by plist text
    - Structural errors become one located ContentError; no partial parse or coercion
    - Vendor script is the only writer of ASSETS.md SHA-256 cells
    - Property test asserts arbitrary bytes yield a value or PLIST_PARSE, never a TypeError

key-files:
  created:
    - tests/fixtures/plist/octal-escapes.plist
    - tests/fixtures/plist/duplicate-keys.plist
    - tests/fixtures/plist/comment-only-array.plist
    - tests/fixtures/plist/empty-dict.plist
    - tests/fixtures/plist/quoted-key-with-space.plist
    - tests/fixtures/plist/malformed-unterminated.plist
    - tests/fixtures/plist/malformed-missing-semicolon.plist
    - tests/fixtures/schemas/commodity-invalid.json
    - tools/oolite-ingest/openstep/parser.test.ts
    - tools/oolite-ingest/failure-contract.test.ts
    - third_party/oolite/Config/*.plist (39 new, 40 total)
  modified:
    - tools/oolite-ingest/openstep/tokenizer.ts
    - tools/oolite-ingest/openstep/parser.ts
    - tools/oolite-ingest/openstep/plist-value.ts
    - tools/oolite-ingest/content-error.ts
    - scripts/vendor-oolite.sh
    - third_party/oolite/CHECKSUMS.sha256
    - ASSETS.md

key-decisions:
  - "Reals require digits on both sides of the point; `.5`, `1.`, `+5` and `1e5` stay strings so no authored value is guessed into a number."
  - "Array values must be comma-separated, but a trailing comma is legal because the pinned corpus uses one."
  - "An excerpt is bounded at the ContentError boundary, not only per source line, so a prefixed detail can never push the stored excerpt past 120 characters."
  - "Optional ContentError fields use `declare` so an absent line/column is genuinely absent at runtime, not an own property holding undefined."
  - "plistToJson projects dictionaries onto Object.create(null), keeping a __proto__ key as ordinary data."
  - "ASSETS.md rows are appended in path order after the existing table rather than re-sorting existing rows, honouring the no-reorder rule."

requirements-completed: [DATA-01, DATA-09]

coverage:
  - id: D1
    description: "Tokenizer/parser complete for the measured grammar: C and octal escapes, duplicate keys, empty containers, quoted keys with spaces, bare/bool/integer/real classification, 64-level cap and __proto__ safety."
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/openstep/parser.test.ts (escape, duplicate, empty-container, quoted-key, bare-token, prototype, structural suites)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Seven hand-written plist fixtures and one schema-invalid fixture encode every failure and edge case."
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/openstep/parser.test.ts"
        status: pass
      - kind: unit
        ref: "tools/oolite-ingest/failure-contract.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 40 pinned Resources/Config plists vendored verbatim with one SHA-256 row each, and parsed by one parser: 31 dictionary roots, 9 array roots."
    requirement: DATA-09
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/openstep/parser.test.ts#parses all 40 Config plists with one parser, 31 dict roots and 9 array roots"
        status: pass
      - kind: other
        ref: "docker compose run --rm assets npm run assets:check"
        status: pass
      - kind: other
        ref: "sha256sum -c third_party/oolite/CHECKSUMS.sha256 (43/43 OK)"
        status: pass
    human_judgment: false
  - id: D4
    description: "PLIST_PARSE asserted with code/file/construct/line/column for unterminated strings and missing semicolons; SCHEMA asserted with a dotted commodities.<key>.<field> path and no position; excerpts capped and host-path-free."
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/failure-contract.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Arbitrary input is a value or a located PLIST_PARSE error (fast-check, 100 runs), and canonical JSON round-trips for all 40 vendored plists."
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "tools/oolite-ingest/openstep/parser.test.ts#total-function property and #canonical round-trip"
        status: pass
    human_judgment: false
  - id: D6
    description: "Vendoring is idempotent: a second vendor run leaves third_party/oolite byte-identical, and a second assets build changes no byte."
    requirement: DATA-09
    verification:
      - kind: other
        ref: "docker compose run --rm assets sh scripts/vendor-oolite.sh twice; git status --porcelain third_party empty"
        status: pass
      - kind: other
        ref: "docker compose run --rm assets twice; git status --porcelain src/content/generated third_party empty"
        status: pass
    human_judgment: false
  - id: D7
    description: "Full repository verification is green end to end."
    verification:
      - kind: integration
        ref: "docker compose run --rm verify (exit 0)"
        status: pass
    human_judgment: false

duration: 9 min
completed: 2026-11-03
status: complete

plan_head_before: 332c4db1b47d90f52ae1d36a53baf69514aa5e43
plan_head_after: 3ce3a1f36a68cfdcf1f83f5a843b8c3b5b4313fa
commits: 4
---

# Phase 2 Plan 02: Full Corpus Parser, Vendored Plists and Failure Contract Summary

**One parser now reads all 40 pinned Config plists (31 dictionary / 9 array roots), decodes Oolite's octal and C escapes exactly, keeps duplicate keys as ordered AST entries, and turns malformed input into one located `ContentError` — verified by a 100-run property test that arbitrary bytes never throw anything else.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-03T11:10:50Z
- **Completed:** 2026-11-03T11:19:30Z
- **Tasks:** 3
- **Files modified:** 56 (39 new vendored plists, 8 fixtures, 6 code/test files, 3 provenance files)

## Accomplishments

- `parseOpenStep` now covers the measured grammar rather than the tracer's single easy file: 7,234 line comments, 212 block comments, quoted keys with spaces, bare atoms, booleans, integers and reals all pass, and a raw newline in a quoted string or a missing array comma fails at a precise position instead of being accepted.
- Octal escapes are load-bearing and now asserted at the byte level: `\007` is BEL + " - Corporate State", `\030` is CAN, `\177` is DEL, and `\\b5` stays backslash + `b` + `5` so the pinned GeForce regex is unchanged.
- Duplicate keys from `keymappings_*.plist`, `logcontrol.plist` and `shader-uniform-bindings.plist` are retained in the AST in source order; `dictToMap` and `getEntry` resolve the last occurrence only at lookup.
- All 40 `Resources/Config/*.plist` files are vendored verbatim, checksummed and recorded in `ASSETS.md`; the parse-all test fails loudly with a file name if any one of them stops parsing.
- The failure contract is now executable: `PLIST_PARSE` carries code, repo-relative file, construct, 1-based line and column; `SCHEMA` carries a dotted `commodities.<key>.<field>` path and genuinely absent positions; every excerpt is ≤120 characters, single-line, and free of host paths.
- A `fast-check` property over 100 arbitrary strings proves the parser is a total function returning either a `PlistValue` or a `ContentError` with code `PLIST_PARSE`; canonical JSON round-trips for every vendored file.

## Task Commits

Each task was committed atomically (Task 1 followed RED → GREEN):

1. **Task 1 RED: pin the OpenStep grammar** — `f30eb7e` (test)
2. **Task 1 GREEN: harden the scanner** — `406e7e6` (feat)
3. **Task 2: vendor 40 plists and prove they parse** — `b34198c` (feat)
4. **Task 3: failure classes and total-function property** — `3ce3a1f` (test)

**Plan metadata:** committed after this SUMMARY (docs).

## Files Created/Modified

- `tools/oolite-ingest/openstep/tokenizer.ts` — raw-newline rejection, bounded octal escapes, BOM/CRLF handling, line/column on every token.
- `tools/oolite-ingest/openstep/parser.ts` — strict array commas with trailing-comma tolerance, `-?\d+\.\d+` real rule, 64-level cap, located structural failures.
- `tools/oolite-ingest/openstep/plist-value.ts` — `keyLine`/`keyColumn` kept, null-prototype JSON projection.
- `tools/oolite-ingest/content-error.ts` — one bounded, single-line excerpt rule; optional fields declared so absent stays absent.
- `tools/oolite-ingest/openstep/parser.test.ts` — 17 tests: escapes, duplicates, empty containers, quoted keys, bare tokens, `__proto__`, structural failures, 40-file parse-all, property, canonical round-trip.
- `tools/oolite-ingest/failure-contract.test.ts` — 5 tests across `PLIST_PARSE` and `SCHEMA`, including `formatContentError` rendering.
- `tests/fixtures/plist/*.plist` — seven tiny fixtures, each encoding one grammar or failure fact.
- `tests/fixtures/schemas/commodity-invalid.json` — one unknown-field record and one string-`priceAverage` record.
- `scripts/vendor-oolite.sh` — `FILES` extended to all 40 Config plists, sorted, one per line.
- `third_party/oolite/Config/*.plist` + `CHECKSUMS.sha256` — 40 vendored files, 43 checksum rows.
- `ASSETS.md` — 39 appended provenance rows; the vendor script filled every hash.

## Decisions Made

- **Real grammar needs digits on both sides.** `-?\d+\.\d+` makes `.5`, `1.`, `+5` and `1e5` strings rather than numbers. The plan's prose regex `-?\d*\.\d+` would have accepted `.5`; the "no bare `.5`" requirement wins.
- **Commas are enforced in arrays.** The plan-01 parser silently accepted `( 1 2 )`; that is now a located `PLIST_PARSE`. A single trailing comma remains legal because the pinned corpus contains one.
- **Excerpt bound belongs to the error, not the source helper.** `sourceExcerpt` was capped, but `fail()` prefixes a detail, so a long line could exceed 120. `ContentError` now normalises and bounds whatever excerpt it receives.
- **`declare` optional class fields.** Normal class fields define own properties holding `undefined`, which would make "no line/column" false at runtime. `declare` removes the emit.
- **Null-prototype JSON projection.** `plistToJson` previously assigned `object["__proto__"]`, which is a prototype setter for object values. `Object.create(null)` makes every key ordinary data.
- **Provenance order.** New `ASSETS.md` rows were appended in path order after the existing table instead of re-sorting existing rows, per the plan's "do not reorder or rewrite existing rows".

## Deviations from Plan

### Process adaptations

**1. TDD RED was narrower than the plan assumed**
- **Found during:** Task 1 RED
- **Issue:** The plan expected octal escapes and the duplicate-key lookup rule to be missing from the plan-01 parser. Plan 01 had already implemented both as a deliberate superset, so those assertions passed immediately. The genuinely red cases were the raw newline inside a quoted string and the missing array comma.
- **Fix/approach:** Wrote the full behavioural suite first and confirmed 4 failing / 10 passing before changing production code; the RED commit (`f30eb7e`) records that state honestly.
- **Impact:** Commit granularity differs from the plan's narrative, not the implementation.

**2. `ASSETS.md` append order vs global sort**
- **Found during:** Task 2
- **Issue:** The table was already path-sorted; inserting 39 rows around `trade-goods` would have rewritten existing rows.
- **Fix/approach:** Appended the 39 new rows in path order after the last existing row. Every vendored file still has exactly one row and the vendor script does not depend on row order.

### Auto-fixed Issues

**3. [Rule 2 - Missing Critical] Null-prototype dictionary projection**
- **Found during:** Task 1 (`__proto__` test design)
- **Issue:** `plistToJson` used `object[entry.key] = ...` on `{}`; a dictionary value keyed `__proto__` could set a prototype (T-02-11).
- **Fix:** Build the projection on `Object.create(null)`.
- **Files modified:** `tools/oolite-ingest/openstep/plist-value.ts`
- **Verification:** `parser.test.ts#keeps a __proto__ key as data and never touches a prototype`.
- **Committed in:** `406e7e6`

**4. [Rule 2 - Missing Critical] Excerpt cap could be exceeded by the detail prefix**
- **Found during:** Task 3 assertion design (T-02-13)
- **Issue:** `fail()` stores `${detail}: ${sourceExcerpt(...)}`; capping only the source line left the stored excerpt able to exceed 120 characters.
- **Fix:** Normalise and bound every excerpt inside `ContentError`.
- **Files modified:** `tools/oolite-ingest/content-error.ts`
- **Verification:** `failure-contract.test.ts` caps length, rejects CR/LF and `/home/`, `/app/`.
- **Committed in:** `3ce3a1f`

---

**Total deviations:** 2 process adaptations + 2 auto-fixed (both Rule 2).
**Impact on plan:** No scope creep. The two fixes are security/privacy requirements already named in the threat model; the process adaptations changed commit granularity and table row placement only.

## Issues Encountered

- `preserve-caught-error` (ESLint) required the re-thrown per-file parse error to carry `{ cause: error }`; fixed in the same task, no behaviour change.
- The container fetch in `vendor-oolite.sh` succeeded for all 40 files; no network workaround was needed.
- The Vite build continues to emit its pre-existing "chunk larger than 500 kB" advisory, unrelated to this plan.

## User Setup Required

None — no external service configuration.

## Next Phase Readiness

- Plan 02-03 can consume `parseOpenStep` for `planetinfo.plist` and `equipment.plist` without touching tokenizer or parser again; both root shapes (dict and array) are already proven on the real corpus.
- Later schema converters should copy the `SCHEMA` construct shape asserted here: `commodities.<key>.<field>`, no line/column, repository-relative file.
- The vendored `Config/` tree is now a 40-file regression corpus: any future parser or bump change fails `parser.test.ts` with the offending file name.
- Known open item: the `fast-check` property uses arbitrary UTF-16 strings, not random bytes; a binary-plist path remains out of scope by CONTEXT decision.

## Self-Check: PASSED

- [x] All 3 tasks executed and committed (`f30eb7e`, `406e7e6`, `b34198c`, `3ce3a1f`).
- [x] `third_party/oolite/Config` holds 40 `.plist` files; `CHECKSUMS.sha256` has 43 rows matching 43 non-checksum files.
- [x] `docker compose run --rm verify` exits 0 (69 tests, build, 2 e2e).
- [x] A second `vendor-oolite.sh` run leaves `git status --porcelain third_party` empty; two assets builds leave generated content unchanged.
- [x] `grep -rn "eval(" tools/oolite-ingest/` returns nothing.
- [x] Four failure classes asserted (unterminated, missing semicolon, unknown field, string price) plus the total-function property and 40-file canonical round-trip.
