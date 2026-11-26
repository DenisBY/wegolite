---
phase: 21-roster-state-shape-and-seams
plan: 10
subsystem: content-pipeline
tags: [auto-ai-map, role-categories, comms, DATA-17, content-only, pitfall-C9, T-21-15, T-21-16]
requires:
  - phase: 21-08
    provides: the 29-record catalogue whose roles these tables are keyed by
provides:
  - src/content/generated/auto-ai-map.json, the role -> AI file table (27 entries)
  - src/content/generated/role-categories.json, the role category lists (16 categories)
  - src/content/generated/comms.json, the comms subset (15 entries, 5 variables)
  - AutoAiMapSchema, RoleCategoriesSchema, CommsStringsSchema (strict, bounded)
  - AUTO_AI_MAP_PATH, ROLE_CATEGORIES_PATH, COMMS_PATH, COMMS_ROOT_KEYS
  - tests/content/ai-map.test.ts, the schema, golden and plist-equality pin for the three files
affects: [phase-22, phase-23]
tech-stack:
  added: []
  patterns: [entry-array content tables, iterative closure with a visited set, converter returns bytes and generate.ts owns I/O]
key-files:
  created:
    - tools/oolite-ingest/convert/auto-ai-map.ts
    - tools/oolite-ingest/convert/auto-ai-map.test.ts
    - tools/oolite-ingest/convert/role-categories.ts
    - tools/oolite-ingest/convert/role-categories.test.ts
    - tools/oolite-ingest/convert/comms.ts
    - tools/oolite-ingest/convert/comms.test.ts
    - src/content/schemas/auto-ai-map.ts
    - src/content/schemas/role-categories.ts
    - src/content/schemas/comms.ts
    - src/content/generated/auto-ai-map.json
    - src/content/generated/role-categories.json
    - src/content/generated/comms.json
    - tests/golden/content/auto-ai-map.json
    - tests/golden/content/role-categories.json
    - tests/golden/content/comms.json
    - tests/content/ai-map.test.ts
  modified:
    - tools/oolite-ingest/generate.ts
    - src/content/generated/manifest.json
    - ASSETS.md
    - NOTICE
key-decisions:
  - "Roles and categories are kept in code-unit order of the key (the plist's authored order is not sorted: `scavenger` follows `trader-smuggler`); role lists inside a category keep the authored order"
  - "The role pattern of the auto-AI map is the lower-case token `^[a-z][a-z0-9-]*$`; the category-list role pattern is loosened to `^[A-Za-z0-9][A-Za-z0-9_-]*\\+?$` so `trader-courier+` and `EQ_THARGON` survive verbatim"
  - "A `[name]` token is a description key to follow only when `name` is a key of the vendored plist; every other bracket token and every `%X` code is a variable, listed verbatim and never followed (so `[7]` is a variable)"
  - "A duplicate plist key (role or category) fails the build instead of last-wins: Oolite's own plists have none, and a duplicate here would hide an authoring slip"
  - "The prototype-named case is closed twice: entry arrays, and anchored key patterns that refuse `__proto__`"
  - "Generated derivative files get an ASSETS.md row (kind generated-asset, SHA-256 of the committed bytes) as this plan's truths require, and a NOTICE paragraph, the convention the other generated files follow"
status: complete
commits: 2
plan_head_before: e9f795e4da35aee7dc0bcf82bbdf1dc73777b385
plan_head_after: 10830c43fd27df1240df1add57852e3d2f4a1416
actuals:
  tokens: 40000
  tasks: 2
  commits: 2
requirements-completed: [DATA-17]
---

# Phase 21 Plan 10: the role-to-AI map, the role categories and the comms subset Summary

**Three Oolite configuration tables the populator and the priority AI read by role are compiled behind strict schemas, goldens, ASSETS.md and NOTICE provenance and the drift gate, with no runtime consumer: 27 role-to-AI entries, 16 role categories, and a 15-key comms subset computed as a closure from the ten `oolite-comms-*` templates.**

## Tracer and task results

| Task | Commit | What it proved |
| ---- | ------ | -------------- |
| 1 (tracer) | `61481bf5` | the auto-AI map end to end: plist -> converter -> `AutoAiMapSchema` -> `auto-ai-map.json` -> manifest row -> golden -> equality test with the independently parsed plist, ASSETS.md row |
| 2 | `10830c43` | the role categories and the comms closure on the proven path, converter tests, the extended content test, NOTICE paragraph, ASSETS.md rows, then the plan gates |

The tracer gate (auto mode): Task 1's targeted run (`auto-ai-map` converter test, `tests/content/ai-map.test.ts`, `tests/compliance-assets.test.ts`: 34 passed) and `assets:check` ("no differences") went end to end before Task 2 started.

## The three tables

| File | Entries | Bytes | Shape |
| ---- | ------- | ----- | ----- |
| `auto-ai-map.json` | 27 (the plist's count at the pin) | 1,954 | array of `{ ai, role }` in code-unit order of `role` |
| `role-categories.json` | 16 categories | 4,061 | array of `{ category, roles }` in code-unit order of `category`, roles in authored order |
| `comms.json` | 15 entries, 5 variables | 3,710 | `{ entries: [{ key, value }], variables: [...] }` |

Canonical JSON sorts object keys, so the entries read `ai` before `role`; the order of the array is the contract.

### The comms closure

Roots (`COMMS_ROOT_KEYS`, the plist's order, lines 652-673): `oolite-comms-contractAttack`, `-makePirateDemand`, `-acceptPirateDemand`, `-surrender`, `-makeDistressCall`, `-markForFines`, `-distressResponseAggressor`, `-offenceDetected`, `-thanksForHelp`, `-police-thanksForHelp`.

Reached through `[...]`: `beg-for-mercy` (via acceptPirateDemand and surrender), `distress-call`, `police-attack-warning`, and from those `describe-pirate` and `describe-Pirate`. That is 10 + 5 = 15 entries.

Variables, never followed: `%H`, `%R`, `[oolite_demandSize]`, `[oolite_entityName]`.

**Correction (code review TOOLS-WR-03, 2026-11-26).** This plan first listed `[7]` as a fifth variable. In Oolite a key made only of digits is not a variable: `ExpandKey` dispatches it to `ExpandDigitKey` (`OOStringExpander.m`), which picks a string from row 7 of `system_description` ("beset", "plagued", "ravaged", "cursed", "scourged"). `comms.json` now lists it under `descriptionIndexes: [7]`, and the row resolves through `labels.json` `systemDescription`. The consumer (Phase 23) substitutes `variables` at runtime and expands each `[N]` in `descriptionIndexes` from `systemDescription[N]`, never as a substitution parameter. The file is now `{ descriptionIndexes, entries, variables }`, 3,736 bytes.

Values are verbatim, a string or the authored list of alternatives (typographic apostrophes and the `…` ellipsis kept). The closure is an iterative queue with a visited set, so a reference cycle (or a key that refers to itself) is followed once and never loops (T-21-16). The converter test recomputes the closure with a second, recursive method and compares key sets, and a further test fails if a bracket token that is a key of the plist is not an entry, or one that is not a key is not a listed variable.

## Schema patterns chosen

| Schema | Field | Pattern and bound |
| ------ | ----- | ----------------- |
| `AutoAiMapSchema` | role | `^[a-z][a-z0-9-]*$`, at most 64 characters |
| | ai | `^[A-Za-z][A-Za-z0-9_-]*\.(js\|plist)$`, at most 64 (no directory part) |
| | table | 1 to 64 entries, unique, code-unit ordered |
| `RoleCategoriesSchema` | category | `^[a-z][a-z0-9-]*$`, at most 64 |
| | role | `^[A-Za-z0-9][A-Za-z0-9_-]*\+?$`, at most 64 |
| | table | 1 to 64 categories, at most 128 roles each (an empty list is valid), unique and ordered categories |
| `CommsStringsSchema` | key | `^[A-Za-z0-9][A-Za-z0-9_-]*$`, at most 96 |
| | value | a string of 1 to 512 characters, or 1 to 32 such strings |
| | variable | `^(?:\[[^[\]]{1,64}\]\|%[A-Za-z])$`, unique, code-unit ordered, at most 64 |
| | entries | 1 to 64, unique, code-unit ordered |

All three are strict objects (an extra key is refused). A failure in a converter is a `SCHEMA` content error that names the role, category or key (and `key.index` for a list item).

## Test pins

- `tools/oolite-ingest/convert/auto-ai-map.test.ts` (9), `role-categories.test.ts` (12), `comms.test.ts` (13): equality with the vendored plist parsed by the existing reader, the refusal cases (non-string value, duplicate key, prototype-named key, missing root key, non-list reached value, over-long string), the empty role list, the cycle and self-reference, and byte-for-byte equality of the emitted bytes with the committed file.
- `tests/content/ai-map.test.ts` (37): each generated file passes its strict schema, equals its golden, equals the vendored plist entry by entry, and a source guard fails if any file under `src/` imports one of the three generated files.
- Goldens are formatted copies of the generated files; the plist-equality tests are the independent pin, so a regenerated drift cannot pass by updating the golden alone.

## Gates

| Gate | Result |
| ---- | ------ |
| targeted Vitest per task | Task 1: 34 passed (3 files); Task 2: 74 passed (4 files) |
| `docker compose run --rm assets npm run assets:check` | "no differences" |
| `docker compose run --rm typecheck` | clean |
| `docker compose run --rm lint` | eslint and prettier clean |
| `docker compose run --rm test` (full, local) | only sporadic load timeouts, all rerun green alone (note below) |
| remote `verify` | exit 0; 302 of 302 unit files, 8,454 tests passed (see "Remote verify") |
| acceptance run | not run: no `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` change |

Full local `test` note: with several worktrees running containers at once, two full runs each failed a handful of files on the 5 s (one on the 30 s) default timeout: run 1 failed 7 files (among them `tools/oolite-ingest/convert/ship-mass.test.ts` and `tests/sim/npc/attack-dispatch.test.ts`), run 2 a different 6 (`tick-parity`, `tools-determinism`, `test-spawn`, `kill.property`, `step`, `hot-weapon`); every failure was a `TestTimeoutError`, none an assertion. The union of the files was rerun alone and passed (300 tests in the seven-file rerun, 66 in `attack-dispatch`). Timeouts were not changed (wave 2 hand-off).

### Remote verify

`~/.claude/scripts/wegolite-remote-run.sh run --rm verify` on snapshot `10830c43` (the second code commit): exit 0, 214 s. Lint and prettier clean, typecheck clean, `assets:check` "no differences", unit tests 302 of 302 files and 8,454 passed (10 skipped), build, and the 28-test Chromium smoke subset passed. The local timeouts above did not recur on the remote machine.

## Deviations from Plan

None to the code: the plan executed as written. Two notes:

- The plan's acceptance and truths ask for ASSETS.md rows for the three generated files, while the repository's convention for generated JSON is a NOTICE paragraph (no earlier generated JSON has an ASSETS.md row, only the vendored inputs and the files under `public/`). Both were added (`generated-asset` rows with the SHA-256 of the committed bytes, and one NOTICE paragraph naming the three files). `tests/compliance-assets.test.ts` does not walk `src/content/generated/`, so these three SHA-256 cells are not enforced by a test: a later change to a generated file must refresh its row by hand.
- `contentError` excerpts and `ContentError.construct` are the carriers of the "naming the key" requirement; the converters never throw a bare `Error`.

## Known Stubs

None. The three files have no runtime consumer by design (a guard in `tests/content/ai-map.test.ts` pins that); Phases 22 and 23 are their first consumers, and that guard is relaxed in the commit that adds one.

## Threat Flags

None. No network endpoint, auth path or file access outside the existing generator was added. T-21-15 (prototype-named key) is closed by entry arrays plus anchored patterns that refuse `__proto__`; T-21-16 (reference cycle, oversized closure) by the iterative closure with a visited set and the bounded schemas; T-21-SC accepted (no package changed).

## Hand-offs

- Phase 23 ports `oolite-priorityai.js` `_setCommunications` (the role-to-comms-key wiring) as code; this plan only supplies the strings. Expansion (random alternative, `[oolite_entityName]`, `%H`, `%R`) is UI-only and must not draw from a sim stream.
- A consumer that needs another description key (an AI that speaks a line outside the ten) must add its root to `COMMS_ROOT_KEYS`; the closure follows from there.
- 21-07's `PRIORITY_PARAM_KEYS` hand-off (the `oolite_intership` cargo-demand values) is not touched here: those values are written by the priority AI at run time, not read from a plist.

## Self-Check: PASSED
