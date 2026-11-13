---
phase: 07-hardening-community-release
plan: 10
subsystem: docs
tags: [readme, controls, contract-test, browser-support, licence, qual-06]

# Dependency graph
requires:
  - phase: 07-hardening-community-release
    provides: "FIDELITY.md (07-06), docs/PERFORMANCE.md (07-05), the e2e-cross command (07-09), the context-loss recovery timeout and copy (07-02), and the licence documents shipped in the build (07-01)"
provides:
  - "README Play, Controls, Supported browsers, Fidelity, Performance, Troubleshooting and Licence and source sections"
  - "tests/contract/readme.test.ts: a Controls check derived from DEFAULT_BINDINGS through labelFor, plus section, browser-claim, version, link and licence checks"
affects: [07-11]

# Actuals (#2632): chars/4 over the realized diff, not a harness token count
actuals:
  tokens: 4052
  tasks: 2
  commits: 2
commits: 2
plan_head_before: b4c5656933f25e2f4ee5da368c8dfdf87a1b0695
plan_head_after: e012926cf6e09bc9647ad6d0ab63c0872fcc61e2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "README controls rows are checked against the same bindings and labels the game uses, so a binding or label change without a README change fails a test"

key-files:
  created:
    - tests/contract/readme.test.ts
    - .planning/phases/07-hardening-community-release/deferred-items.md
  modified:
    - README.md

key-decisions:
  - "The Controls section is one table per group under a bold sub-label (Flight, Galactic chart, Docked station, Save and load, Anywhere), because a single GFM table cannot carry sub-labels; every action with a default code appears exactly once"
  - "The README states that frame rate is judged only on a real GPU by docs/PERFORMANCE.md and makes no 60 fps claim, because that document records the official 1920x1080 DPR 1 run as still pending"
  - "The Controls test reads DEFAULT_BINDINGS (cast to BindingMap, type only) so the expected keys are the default table itself, not a sanitised copy"

patterns-established:
  - "Contract tests for public documentation derive their expectations from the code constants they describe (bindings, labels, timeout, package version) instead of restating them"

requirements-completed: [QUAL-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Controls section lists every action with a default code, plus the Shift+C and Shift+Left/Right rows, with the exact labels and keys from the game"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/readme.test.ts#QUAL-06 Controls table is derived from the bindings"
        status: pass
    human_judgment: false
  - id: D2
    description: "Play section: docker compose up preview and http://localhost:4173, the dev server alternative, and the Wegolite 0.1.0 release line from package.json"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/readme.test.ts#QUAL-06 README sections"
        status: pass
    human_judgment: false
  - id: D3
    description: "Supported browsers section claims current stable Chrome and current stable Firefox with no version numbers and names no other browser"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/readme.test.ts#QUAL-06 README sections: claims exactly current stable Chrome and Firefox with no version numbers"
        status: pass
    human_judgment: true
    rationale: "The text follows D-07 and D-08 and the test pins the text, but the Safari conflict with ROADMAP criterion 2 and QUAL-02 is an owner decision that plan 07-11 records; the test cannot settle it."
  - id: D4
    description: "Troubleshooting section: the WebGL2 requirement, the lost-context pause, resume with P or Esc, the 10 second reload prompt, and the hidden-tab pause"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/readme.test.ts#QUAL-06 README sections: states the WebGL2 requirement and the shipped recovery behaviour"
        status: pass
    human_judgment: true
    rationale: "The recovery copy in src/app/context-recovery.ts is placeholder wording (D-16); the owner's final copy replaces it there and in this section together."
  - id: D5
    description: "Fidelity and Performance sections link FIDELITY.md and docs/PERFORMANCE.md, both files exist, and the frame budget numbers match the document"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/readme.test.ts#QUAL-06 README sections: links FIDELITY.md and docs/PERFORMANCE.md, and both files exist"
        status: pass
    human_judgment: false
  - id: D6
    description: "Licence and source section names NOTICE, LICENSE and ASSETS.md, the footer links, and the source URL https://github.com/DenisBY/wegolite"
    requirement: "QUAL-06"
    verification:
      - kind: unit
        ref: "tests/contract/readme.test.ts#QUAL-06 README sections: names NOTICE, LICENSE and ASSETS.md and says the site links them"
        status: pass
    human_judgment: false

# Metrics
duration: "approx. 15 min (start time not recorded)"
completed: 2026-11-08
status: complete
---

# Phase 7 Plan 10: README controls, play, browsers, fidelity, performance, troubleshooting and licence sections Summary

**README controls table derived from the game's default bindings and labels, with a contract test that fails on drift, plus the exact browser claim, recovery behaviour and licence and source sections**

## Performance

- **Duration:** approx. 15 min (start time was not recorded at plan start)
- **Started:** not recorded
- **Completed:** 2026-11-08
- **Tasks:** 2 of 2
- **Files modified:** 3 (README.md, tests/contract/readme.test.ts, deferred-items.md)

## Accomplishments

- Controls section lists all 46 actions in the game's ACTION_LABELS, in five groups, each keys cell the exact `labelFor(DEFAULT_BINDINGS, action)` output (for example `Shift+C`, `P / Esc`, `Shift+Left arrow`, `Shift+Right arrow`).
- tests/contract/readme.test.ts derives the expected table from DEFAULT_BINDINGS, labelFor, codeLabel and SHIFT_VARIANT_ACTIONS. It fails on a missing, duplicated, stale or differing row, and carries a vacuity guard of at least 30 rows and a uniqueness check on ACTION_LABELS.
- Play, Supported browsers, Fidelity, Performance, Troubleshooting and Licence and source sections are added. Existing README sections and every existing pin in tests/contract/container-contract.test.ts are unchanged and still pass.
- The Troubleshooting test reads CONTEXT_RESTORE_TIMEOUT_MS, so the README's "10 seconds" follows the constant rather than a restated number.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end controls documentation, README table derived from the default bindings, checked by a contract test** - `47146e3` (docs)
2. **Task 2: Play, release, supported browsers, fidelity, performance, troubleshooting, and licence and source sections** - `e012926` (docs)

**Plan metadata:** recorded in the docs commit that follows this SUMMARY (SUMMARY, then STATE and ROADMAP).

## Files Created/Modified

- `README.md` - Play, Controls, Supported browsers, Fidelity, Performance, Troubleshooting, and Licence and source sections added; Commands, Content pipeline, Operational notes, Repository layout and the intro unchanged.
- `tests/contract/readme.test.ts` - new contract test: binding-derived Controls checks, section headings once each, release title, Play URLs, browser claim, check commands, WebGL2 and recovery copy, links and file existence, frame budget numbers, e2e-cross command, source URL, and licence documents.
- `.planning/phases/07-hardening-community-release/deferred-items.md` - new; logs one out-of-scope finding (see Issues Encountered).

## Decisions Made

- The Controls section uses one table per group under a bold sub-label, not one table with a group column. The plan said both "one Markdown table" and "bold sub-labels"; a single GFM table cannot carry sub-labels, so each group gets its own table and the test reads every table in the section.
- Performance wording: the plan asked for "60 fps at 1080p is measured on a reference desktop". docs/PERFORMANCE.md records the official 1920x1080 DPR 1 run as pending, so the README says frame rate is judged only on a real GPU by that protocol and makes no 60 fps claim.
- The Controls test casts DEFAULT_BINDINGS to BindingMap (type only, no runtime change) so the expected keys come from the default table itself.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Supported browsers sentence split a pinned phrase across a line break**
- **Found during:** Task 2
- **Issue:** The first wording wrapped "current stable Firefox" across two lines in the Markdown source, so the pinned phrase was absent from the section text the test reads.
- **Fix:** Reworded the sentence so both phrases sit on one line. The claim is unchanged.
- **Files modified:** README.md
- **Verification:** readme.test.ts passed after the change.
- **Committed in:** e012926 (Task 2)

**Total deviations:** 1 auto-fixed (1 bug). Two wording choices above (per-group tables and the frame-rate sentence) are interpretations of the plan, recorded under Decisions Made, not rule deviations.

**Impact on plan:** None on scope or acceptance. Both tasks completed with the planned checks.

## Verification

- `docker compose run --rm test npx vitest run tests/contract/readme.test.ts tests/contract/container-contract.test.ts tests/compliance.test.ts`: 3 files, 56 tests, all passed.
- `docker compose run --rm test` (full Vitest suite, coverage on): 94 files, 1187 tests passed, 1 skipped, exit 0.
- `docker compose run --rm lint` (eslint and prettier --check over the repository): exit 0.
- Drift check: README Shift+C changed to Shift+X in a working copy. readme.test.ts failed with `Docking computer: README "Shift+X" !== game "Shift+C"`. The file was restored from the committed state.
- Acceptance greps: `^## Controls` 1 match; `Shift\+C` 1 match; the six Task 2 headings 6 matches; `safari|webkit` (case-insensitive) no match; `Wegolite 0\.1\.0` 1 match.
- Not run: `docker compose run --rm e2e` and `e2e-cross`, and the full `verify` chain. This plan changes only README.md and a Vitest contract file, which no browser spec reads.

## Issues Encountered

- Out-of-scope finding, logged to `deferred-items.md` and not fixed here: `src/app/fallback.ts` (`WEBGL2_FALLBACK_MESSAGE`) tells players to "Try a current Chrome, Firefox or Safari". That contradicts the README's D-07 claim, and no current guard covers app strings. This needs the owner's Safari decision, which plan 07-11 records.
- The Troubleshooting paragraphs paraphrase placeholder copy from src/app/context-recovery.ts (D-16). The contract test follows the timeout constant, but the wording must change in both places when the owner supplies final copy.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- QUAL-06 is complete for this plan. Plan 07-06 also declares QUAL-06; `requirements.ready-ids` reported it ready once this SUMMARY exists.
- Plan 07-11 owns the Safari conflict in PROJECT.md and the fallback message wording logged in deferred-items.md.
- Ready for 07-11.

## Self-Check

Checked after writing this file and before its commit: each key file exists on disk, and both task commits (47146e3, e012926) are ancestors of HEAD.

## Self-Check: PASSED

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-08*
