---
phase: 19-equipment-damage-and-repair
plan: 06
subsystem: persistence
tags: [save, zod, no-migration, corrupt-classification, test-builders, tripwire]
requires:
  - phase: 13-laser-mounts
    provides: the v4 save schema (laserMounts) and the checked-in historical goldens
provides:
  - parseSave reads only SAVE_VERSION; every other recognised numeric version not above it is corrupt (D-11)
  - the current schema lists its keys explicitly; the v1 to v3 schemas, types and the three ordered migrations are gone
  - tests/helpers/save-builders.ts (saveAllowLists, saveInputs, currentSave), shared by the save suites
  - the historical-save classification case over the eleven goldens (save-v4.test.ts)
  - the browser corrupt journey (backed up once, not offered, New game recovers saving)
  - the alias read-tolerance tripwire and its pending todo
affects: [19-07, 19-08, 19-09]
actuals:
  tokens: 9500
  tasks: 2
  commits: 2
plan_head_before: 65f40d17f30637d5759fbb29b45165a8afe7d670
plan_head_after: daf67251ff71aa7a3f195c605291a3ac26350d31
tech-stack:
  added: []
  patterns:
    - "A test blob is the parsed output of the production writer (currentSave over encodeSave), never a hand-built shape"
    - "Deferred fix = pending todo plus a comment-stripped source tripwire whose failure messages name the todo"
key-files:
  created:
    - tests/helpers/save-builders.ts
    - tests/guards/legacy-equipment-alias.test.ts
    - .planning/todos/pending/2026-11-21-retire-legacy-equipment-alias-read-tolerance.md
  modified:
    - src/persistence/save.ts
    - src/sim/flight/state.ts
    - tests/persistence/save.test.ts
    - tests/persistence/save-v2.test.ts
    - tests/persistence/save-v3.test.ts
    - tests/persistence/save-v4.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/e2e/autosave.spec.ts
    - CHANGELOG.md
  deleted:
    - tests/persistence/save-golden.test.ts
key-decisions:
  - "An older save is corrupt, never unreadable: canOverwrite/canClear would turn unreadable into a session-long save lockout (D-11, T-19-13)"
  - "The default saveInputs carries the system's derived marketSeed: the semantic validator requires exactly one seed encoding, so a default without one would not parse ok"
  - "The eleven goldens stay byte-identical and become the rejection fixtures; the classification case reads each file's own version, so the v5 bump (19-08) needs no edit to it"
requirements-completed: [SAVE-09]
status: complete
---

# Phase 19 Plan 06: Retire the save migration chain Summary

**`parseSave` now reads only the current save version and classifies every older save as `corrupt` (backed up once, cleared by New game); the v1 to v3 schemas and the three migrations are deleted, the save suites run on current-version blobs from one set of builders, and the browser proves that New game recovers saving.**

## Performance

- **Tasks:** 2 of 2 (Task 1 is the tracer: the older save is corrupt in Node, in the session's Load and in the browser; Task 2 deletes the dead chain and adds the alias tripwire)
- **Commits:** 8b4c223 (Task 1), daf6725 (Task 2)

## Accomplishments

- `parseSave` has one branch, `version === SAVE_VERSION` through the current schema; 1, 2, 3, 0, negative and fractional versions fall to `corrupt`; a version above stays `future-version`. The function doc, the corrupt-branch comment and the module header state the rule (an older numeric version or a rule-breaking current blob is corrupt; oversized, unparseable or unrecognised blobs stay unreadable).
- `SaveV4Schema` is one `z.strictObject` that lists its keys explicitly (version literal, mode, clock, credits, equipment, system, station, the optional cargo/fuel/missiles/passengerBerths/marketSeed/market/targetSystem/flight, epoch, nextEntityId, laserMounts). `SaveV1Schema`, `SaveV2Schema`, `SaveV3Schema`, their types, `migrateV1ToV2`, `migrateV2ToV3` and `migrateV3ToV4` are gone from `src` and `tests`; the `CLOCK_START` doc in `src/sim/flight/state.ts` no longer names a version.
- `tests/helpers/save-builders.ts` (no test-framework import): `saveAllowLists`, `saveInputs`, `currentSave` and `MARKET_GOODS`. `currentSave()` equals `JSON.parse(encodeSave(saveInputs()))` and parses ok (pinned in `save.test.ts`).
- `save-v4.test.ts` gained `every historical save older than SAVE_VERSION is corrupt (D-11)`: it reads all eleven goldens, asserts none is newer and at least one is older, expects `{ ok: false, reason: "corrupt" }` for each older one and a byte-equal accept for one at the current version. It holds unchanged through the v5 bump. The explicit edge is pinned too: version 3 is corrupt (also with every current field under `version: 3`, no silent re-labelling), `SAVE_VERSION` parses, `SAVE_VERSION + 1` is `future-version`.
- The session's Load of an older blob (`world-lifecycle.test.ts`) reports corrupt and touches neither the lifecycle nor the world.
- Browser: `an older save is corrupt: backed up once, not offered, and New game recovers saving` writes the real `v1-phase4.json` golden, and asserts `save.status` `corrupt`, `autosave.corrupt` byte-identical, Continue hidden, the confirmation on New game, `save.status` `absent` afterwards, and that the next launch commits a current-version blob (`save.committed` increments).
- CHANGELOG `## [Unreleased]` gets a **Breaking** `### Changed` entry (format 1 to 3 saves are no longer loaded; 19-08 widens it to format 4).

## Classification table (the eleven goldens, read by `save-v4.test.ts`)

| Golden | version | Result |
| ------ | ------- | ------ |
| v1-phase4.json | 1 | corrupt |
| v1-phase5.json | 1 | corrupt |
| v2-from-v1-phase4.json | 2 | corrupt |
| v2-from-v1-phase5.json | 2 | corrupt |
| v2-phase10-inflight.json | 2 | corrupt |
| v3-from-v1-phase4.json | 3 | corrupt |
| v3-from-v1-phase5.json | 3 | corrupt |
| v3-from-v2-phase10-inflight.json | 3 | corrupt |
| v4-from-v1-phase4.json | 4 | ok (equals the file) |
| v4-from-v1-phase5.json | 4 | ok (equals the file) |
| v4-from-v2-phase10-inflight.json | 4 | ok (equals the file) |

`git diff HEAD -- tests/golden/save` is empty: the goldens are untouched.

## Removed and rebased cases (T-19-24 ledger)

Removed because their subject was an older version or the chain (reason in brackets):

- `save.test.ts`: "accepts a minimal v2 docked object carrying one seed" [accepting an older version; the reject table now has rows for version 1, 2 and 3, each corrupt]; reject row "v2 with an unknown top-level key" [the v2 schema; the current `extra top-level key` row guards the rule]; "derives the seed for a Phase 4 blob that carried none" [subject: the v1 migration].
- `save-v2.test.ts`: "maps every v1 field to a v2 docked object", "derives the seed when the v1 blob carried none", "is pure: it neither mutates its input nor performs I/O", "the historical schema accepts exactly version 1, and v2 exactly 2" [direct calls of the deleted migrations and schemas]; "parseSave reads a v1 blob through v2 and v3 into the v4 object" [the chain]; classification row "a version-1 object that fails the v1 schema is corrupt" [the v1 schema].
- `save-v3.test.ts`: "a v2 seed-only docked blob parses to the v2 object stepped to v4", "a v1 blob parses through v2 and v3 into v4 with the derived market seed", "migrateV2ToV3 never mutates its input and is deterministic" [the chain]; "a v2 or v1 blob carrying epoch is corrupt" [older versions, now covered by the classification case]; the `expect(SAVE_VERSION).toBe(4)` line [a literal in a version-agnostic suite; `save-v4.test.ts` pins "the version this build writes is 4"].
- `save-v4.test.ts`: the ordered-chain block (per golden pair: "step v3 -> v4", "chain v1 -> v4", "a v2 save loads", "a v3 save loads", "the v4 golden itself parses"; the captured v2 writer blob: "step v3 -> v4", "a v2 in-flight save loads", "every non-laser field is carried unchanged from the v3 golden") [the chain; the v4 golden's accept is the equal-version arm of the classification case]; the "v3 to v4 step" block ("a migrated v3 save carries the same mounts", "restoring a migrated save gives the new-game mounts", "migrateV3ToV4 never mutates its input...", "v3 stays frozen as version literal 3 and v4 is its own strict schema") [the migration and the v3 schema].
- `save-golden.test.ts` (deleted): the v1 golden steps and chain, "a v2 save loads", "migrates the same v1 blob twice to identical bytes", "re-parses the migrated v4 to an equal object (round trip)" and the captured v2 writer golden cases [the chain; the round-trip rule of the current schema is covered by the "beam laser on aft survives encodeSave, parseSave and profileFromSave" case (second snapshot, same bytes) and the `currentSave` builder case].

Rebased onto current-version blobs (same rule, same refusal reason): every other case of `save.test.ts` (reject table, cargo and hold semantics, capacity boundaries, resource bound, `encodeSave` key set), `save-v2.test.ts` (accept path, classification, market snapshot 11 refusals and 3 accepts, flight pose 7 refusals and 1 accept, encode projections, size bound, writer gate) and `save-v3.test.ts` (epoch and counter bounds and required fields, writer gate at the epoch bound, classification). The old `wrong mode` row became `unknown mode` (the v1 `docked` literal no longer exists; the enum is the rule). Version literals outside `save-v4.test.ts` are `SAVE_VERSION` and `SAVE_VERSION + 1`.

## Alias tolerance: todo and tripwire

- Todo: `.planning/todos/pending/2026-11-21-retire-legacy-equipment-alias-read-tolerance.md` (Problem, Fix, `## Guard`).
- Tripwire: `tests/guards/legacy-equipment-alias.test.ts` (12 cases). Pinned non-comment line counts at this tree: `src/persistence/save.ts` 2 (`LEGACY_BERTH_ALIAS`) and 2 (`LEGACY_MISSILE_ALIAS`); `src/persistence/autosave.ts` 2 and 2. Matches the 0d922a2 measurement, so nothing to report. Synthetic failures: a third file naming either constant, a pinned file with one more use, a pinned file naming neither constant (the tolerance gone), a missing pinned file; the comment-only token passes. The writer gate refuses an alias blob and the reader accepts it, per constant. Every message names the todo path.

## Verification records

- Targeted: `docker compose run --rm test npx vitest run tests/persistence tests/app/session/world-lifecycle.test.ts tests/app/session/save-controller.test.ts tests/guards/legacy-equipment-alias.test.ts`: 9 files, 315 tests passed. `docker compose run --rm typecheck`: clean. List-only check: `Total: 1 test in 1 file`.
- Plan boundary, local: `docker compose run --rm lint`: eslint and prettier clean. Two full `docker compose run --rm test` runs on a machine shared with other agents' containers failed only with 5 s and 30 s timeouts (kill.property, attack-dispatch, static-hulls, the known-flaky textures test, tools-determinism, once world-lifecycle); the six files pass in isolation (`6 passed`), and the unthrottled full run is the remote `verify` below.
- Remote (a scratch copy of the wrapper, see Deviations):
  - `run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/autosave.spec.ts tests/e2e/save-load.spec.ts --reporter=list"`: `snapshot daf6725`, `exit=0 elapsed=205s`, 28 passed (the new corrupt journey included, 5.9 s).
  - `run --rm verify`: `snapshot daf6725`, `exit=0 elapsed=240s`, 269 of 269 unit test files passed, 27 smoke specs passed; `src/persistence` coverage lines 88.75 against the 88 floor.

## Deviations from Plan

**1. [Rule 3 - Blocking] The remote wrapper does not sync a worktree**
- **Found during:** the plan-boundary remote run
- **Issue:** `/home/opencode/.claude/scripts/wegolite-remote-run.sh` hard-codes `REPO=/home/opencode/git/wegolite`, so it archives the main checkout's HEAD (`65f40d1`), not the worktree's commits, whatever the cwd. My first run printed `snapshot 65f40d1` and was testing the old code; I terminated it on my side (exit 143). Killing its remote container was denied by the permission classifier and not retried; it ended on its own before the next run started (remote idle, load 0).
- **Fix:** a scratch copy of the wrapper under the session scratchpad, identical except `REPO` points at this worktree; both recorded runs above used it and print `snapshot daf6725` (this worktree's Task 2 commit). The tracked wrapper is unchanged.
- **Follow-up for the orchestrator:** the wrapper should take the repo root from `git rev-parse --show-toplevel` (or an env override) before other worktree plans use it.

**2. [Interpretation] The default `saveInputs` carries a `marketSeed`**
- **Issue:** the plan says optional fields "appear only when given", but the semantic validator requires exactly one seed encoding, and `currentSave()` must parse ok.
- **Fix:** the default carries `marketSeedForSystem("g0-s7")`; an override with `market` makes the encoder drop it, and `currentSave({ marketSeed: undefined })` builds the "neither seed" refusal.

**3. [Scope detail] Task 1 left no direct migration test untouched**
- The parse-based older-version cases moved in Task 1 as planned; the direct calls of the migrations stayed until Task 2 deleted them with the functions, so every commit is green.

No other deviations: the v4 field set, the `marketSeed` encoding and the read-mode alias tolerance are unchanged.

## Known Stubs

None.

## Threat Flags

None: no new network, auth, file-access or trust-boundary surface. T-19-13 (an old save classified unreadable) is mitigated by the classification case and the browser journey; T-19-24 by the ledger above and the byte-identical goldens; T-19-28 by the tripwire.

## Self-Check: PASSED

- Files: `tests/helpers/save-builders.ts`, `tests/guards/legacy-equipment-alias.test.ts`, `.planning/todos/pending/2026-11-21-retire-legacy-equipment-alias-read-tolerance.md` present; `tests/persistence/save-golden.test.ts` absent.
- Commits 8b4c223 and daf6725 are ancestors of HEAD.
- Acceptance greps: `rg -l "SaveV1Schema|SaveV2Schema|SaveV3Schema|migrateV1ToV2|migrateV2ToV3|migrateV3ToV4" src tests` prints nothing; `rg -l "\bLEGACY_(BERTH|MISSILE)_ALIAS\b" src` lists exactly `src/persistence/autosave.ts` and `src/persistence/save.ts`; the helper has 3 exported builder functions and no framework import.
- STATE.md and ROADMAP.md were not modified.
