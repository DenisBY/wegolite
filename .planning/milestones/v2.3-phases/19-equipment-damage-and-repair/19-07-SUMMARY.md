---
phase: 19-equipment-damage-and-repair
plan: 07
subsystem: persistence-tests
tags: [save, fixtures, test-builders, corrupt-classification, requirements-wording]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-06: tests/helpers/save-builders.ts and the corrupt classification of older saves"
provides:
  - "Browser save fixtures built from the shared saveInputs through the production encodeSave (bytes unchanged)"
  - "Future-version fixtures at SAVE_VERSION + 1 in autosave.spec.ts and save-load.spec.ts"
  - "Four browser refusal cases rebased on current-version blobs, each corrupt for its own defect"
  - "save-controller, station-controller and restore-drift tests on saveAllowLists and saveInputs"
  - "No browser spec or app test asserts a literal save version"
  - "SAVE-09 and ROADMAP Phase 19 criterion 4 worded for the corrupt path"
affects: [19-08, 19-09]
requirements-completed: [SAVE-09]
actuals:
  tokens: 6300
  tasks: 2
  commits: 3
plan_head_before: ca47e55d8878710755f4f0fdb9b12aa722c2f3a5
plan_head_after: 64ad93ed8637c375b19bf5f0c5515382cfe891e0
tech-stack:
  added: []
  patterns:
    - "A browser fixture is encodeSave(saveInputs({...})): only the fields that differ from the builder defaults are passed"
    - "A refusal case differs from a valid current-version blob only in the defect it names, and a known-good control proves the defect is decisive"
key-files:
  created: []
  modified:
    - tests/e2e/helpers/save-fixtures.ts
    - tests/e2e/autosave.spec.ts
    - tests/e2e/save-load.spec.ts
    - tests/app/session/save-controller.test.ts
    - tests/app/session/station-controller.test.ts
    - tests/persistence/restore-drift.test.ts
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
key-decisions:
  - "The two buildSnapshotInputs expectations drop the builder's default marketSeed through a local expectedInputs helper: the controller supplies the market snapshot, and under exactOptionalPropertyTypes an undefined override is a type error"
  - "The marketGoods override is dropped from the three app tests: the committed 17-commodity catalogue equals the builder's MARKET_GOODS, so the default is the same set"
status: complete
---

# Phase 19 Plan 07: Fixtures from the shared builders Summary

**Every browser save fixture and three Node app tests now build from the shared current-version builders, the future-version fixtures follow `SAVE_VERSION`, the four browser refusal cases fail for their own defect, and SAVE-09 and criterion 4 name the corrupt path; the v5 bump (19-08) needs no browser-spec or app-test edit.**

## Performance

- **Tasks:** 2 of 2 (Task 1 is the tracer: the fixtures and refusal cases, proved by the remote browser run)
- **Commits:** three code commits (listed under Task Commits), measured from the plan base; the SUMMARY commit follows.
- **Estimate vs actual:** about 6,300 tokens (chars/4 over the diff against the plan base) against an estimate of 55,000.

## Task Commits

| Task | Commit  | Files |
| ---- | ------- | ----- |
| 1    | f7ce133 | `tests/e2e/helpers/save-fixtures.ts`, `tests/e2e/autosave.spec.ts`, `tests/e2e/save-load.spec.ts` |
| 2    | 85b1d51 | the three app tests, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` |
| 2 (lint fix) | 64ad93e | `tests/app/session/save-controller.test.ts` (`void _seed`, the repository's rest-sibling idiom) |

## Accomplishments

- `dockedSaveAt` and `inFlightSaveAt` are `encodeSave(saveInputs({...}))` with only the differing fields (market seed, system, station, mode, target, pose).
- Byte preservation, measured. A scratch script under `/tmp/19-07-bytes` (mounted at `/scratch`, run in the `test` container) printed the sha256 of every distinct fixture call the specs make (`budget.spec.ts`, `hyperspace-failure.spec.ts`, `traffic.spec.ts`; the traffic pose depends on a computed value, so a fixed pose stands in for it). Identical before the first edit and after the last:

  | Call | sha256 (before = after) |
  | ---- | ----------------------- |
  | `dockedSaveAt("Diso")` | `87abe9661276a4897a4cdff90a1db05b17a205d34eb135c87fbe2e792e0590e6` |
  | `dockedSaveAt("Lave")` | `449aa33a0056531a1e32dd6b4683000b35de862c92c6010f9c3161d65573afc4` |
  | `inFlightSaveAt("Lave", ORIGIN_POSE, "Diso")` | `c3f6ea250495c35b2372f28e7cac93be926e57b107aae0a5d84e94d5116786fd` |
  | `inFlightSaveAt("Lave", ORIGIN_POSE)` | `32331bbb09e1404604620f0f8644293706e2f39176dcae4f088d44e7831f9137` |
  | `inFlightSaveAt("Lave", [12345.5, -678.25, 90000] pose)` | `3c5dd4173ca6a0d174ceb39a1ce1d53fde751ddf0ad6ef4d8abb47dc449e2311` |

  No hash is pinned in the repository (19-08 changes the bytes on purpose).
- Future-version fixtures are `SAVE_VERSION + 1` (two in `autosave.spec.ts`, two in `save-load.spec.ts`); `rg "version: 5"` over both specs prints nothing.
- `save-load.spec.ts` asserts `expect(blob.version).toBe(SAVE_VERSION)`, and the comments that named v4 and v2 now say "current-version". `station-controller.test.ts` asserts `parsed.save.version` equals `SAVE_VERSION`. `rg '(blob|save)\.version\)\.toBe\([0-9]' tests/e2e tests/app` prints nothing.

## Rebased refusal cases and the defect each now proves

| Test (autosave.spec.ts) | Blob | Defect it proves |
| ----------------------- | ---- | ---------------- |
| an invalid current-version blob is backed up once and never blocks boot (was "a v1-shaped invalid blob ...") | `currentSave({ credits: -1 })` | negative credits in the current schema |
| duplicate equipment makes an otherwise valid blob corrupt | `currentSave({ equipment: ["EQ_DOCK_COMP", "EQ_DOCK_COMP"] })` | duplicate equipment key |
| a blob with an unknown market good is corrupt and backed up (was "a v2 blob ...") | `currentSave` with the 17-good `market` snapshot, last good `unobtainium`, `marketSeed` removed | one unknown market good |
| a blob with 21 t of Food at Lave is corrupt, backed up and never offered (was "a v1 blob ...") | `currentSave({ cargo: [{ key: "food", quantity: 21 }] })` | cargo above the 20 t Lave hold |

Every test keeps its assertions (status `corrupt`, backup byte-identical, Continue hidden, no console errors). The unknown-good case also asserts, before `writeRaw`, that the blob has no `marketSeed` key and 17 goods; its control (same object, last good `alien_items`) parses `ok: true` and the refusal blob parses `{ ok: false, reason: "corrupt" }` through `parseSave` with `saveAllowLists()`, so the unknown good is the decisive defect and not the seed encoding or the version. A Node scratch run also confirmed the other three blobs refuse and that 20 t of Food parses ok.

## App tests

- `save-controller.test.ts`, `station-controller.test.ts` and `restore-drift.test.ts` build `ALLOW` / `SAVE_ALLOW` with `saveAllowLists({...})`, carrying the same fields except `marketGoods` (the default is the same 17 keys; see key decisions). The `SaveAllowLists` type import is gone from them; `world-lifecycle.test.ts` (not in this plan) still has its own literal.
- The two exact `buildSnapshotInputs` expectations use `expectedInputs({...})`, a local wrapper over `saveInputs` that drops the builder's seed-only default; the check stays an exact `toEqual`.

## Requirement and roadmap wording

- `.planning/REQUIREMENTS.md` SAVE-09: "alpha: older saves (v1 to v4) are rejected as corrupt, backed up once and cleared by New game, so autosave keeps working (owner 2026-11-21)".
- `.planning/ROADMAP.md` Phase 19 criterion 4: "a v1 to v4 save is rejected through the existing corrupt path (owner 2026-11-21: unreadable would disable saving for the session)". Plan-progress rows were not touched.

## Verification records

- Pre-edit list-only check: `docker compose run --rm e2e npx playwright test --list tests/e2e/autosave.spec.ts tests/e2e/save-load.spec.ts` printed `Total: 28 tests in 2 files`; the same line after the edits (no test added or removed).
- Targeted: the three app test files, 3 files and 56 tests passed; `docker compose run --rm typecheck` clean after each task.
- Plan boundary, local: `docker compose run --rm lint` clean. The first full `docker compose run --rm test` (other agents' containers were running) failed only on 5 s and 30 s timeouts in six files this plan did not touch (`world-lifecycle`, `tools-determinism`, `kill.property`, `attack-dispatch`, `static-hulls`, the known-flaky `textures`); rerun alone, four passed and `attack-dispatch` and `textures` timed out again at 5 s under load, then both passed on a third, quiet run (86 tests). The unthrottled full run is the remote `verify` below.
- Remote (`/home/opencode/.claude/scripts/wegolite-remote-run.sh`, which now takes the repo root from the cwd, so it synced this worktree):
  - `run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/autosave.spec.ts tests/e2e/save-load.spec.ts tests/e2e/probe-shape.spec.ts --reporter=list"`: `snapshot 64ad93e`, `exit=0 elapsed=221s`, 35 passed.
  - `run --rm verify`: `snapshot 64ad93e`, `exit=0 elapsed=240s`, 273 of 273 unit test files passed (7153 tests, 10 skipped), 27 smoke specs passed.
  - Both snapshot SHAs equal this worktree's final HEAD (64ad93e).

## Deviations from Plan

**1. [Rule 1 - Bug] `_seed` flagged by eslint**
- **Found during:** the plan-boundary `lint`
- **Issue:** the destructured, intentionally dropped `marketSeed` in `expectedInputs` tripped `@typescript-eslint/no-unused-vars`.
- **Fix:** `void _seed;`, the idiom `tests/content/ships-client.test.ts` already uses.
- **Files modified:** `tests/app/session/save-controller.test.ts`
- **Commit:** 64ad93e

**2. [Interpretation] `expectedInputs` wrapper and dropped `marketGoods` override**
- The plan says the expectations become `saveInputs({...the same fields})`. The builder defaults to `marketSeed`, while the controller supplies a `market` snapshot, so a bare `saveInputs({ market, ... })` has an extra `marketSeed` that `toEqual` rejects, and passing `marketSeed: undefined` is a type error under `exactOptionalPropertyTypes`. The wrapper removes only that default.
- The plan's acceptance gate wants `marketGoods:` absent from the three tests, so the override was dropped; the committed catalogue is the same 17 keys as `MARKET_GOODS`, and the three files pass.

No other deviations.

## Known Stubs

None.

## Threat Flags

None: tests and two planning documents only. T-19-25 is mitigated by the four rebased cases and the control; T-19-26 by the fixtures going through the production writer and the strict boot reader, with no hook mutation.

## Self-Check: PASSED

- Files: the eight modified files and this SUMMARY exist.
- Commits f7ce133, 85b1d51 and 64ad93e are ancestors of HEAD.
- Acceptance greps: no `version: 5` in the two specs; `SAVE_VERSION + 1` in both; `saveInputs(` twice in `save-fixtures.ts`; no `version: 1` or `version: 2` literal left in `autosave.spec.ts` as a save vehicle (the structured-clone shape at the "unreadable stored shape" case is unchanged); no literal-version assertion over `tests/e2e` and `tests/app`; no "canonical v4" or "real v2 docked blob" in `save-load.spec.ts`; `parseSave(` in `autosave.spec.ts`; "rejected as unreadable" and "existing unreadable path" gone; "rejected as corrupt, backed up once and cleared by New game" once in REQUIREMENTS.md; no `marketGoods:` in the three app tests.
- STATE.md and the ROADMAP progress rows were not modified.
