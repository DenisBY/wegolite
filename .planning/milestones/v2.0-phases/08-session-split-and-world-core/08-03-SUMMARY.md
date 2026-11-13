---
phase: 08-session-split-and-world-core
plan: 03
subsystem: testing
tags: [eslint, determinism, no-restricted-syntax, guard-tests, probes, entity-id-scope]

requires:
  - phase: 07-engine-and-release-gates
    provides: the shared ESLint Node API gate (tests/guards/eslint-gate.ts), the probe lock, the sim zone block in eslint.config.js
provides:
  - SIM_SYNTAX_BANS, SIM_GLOBAL_BANS and SIM_RESTRICTED_PROPERTIES in eslint.config.js, spread into the src/sim/**/*.ts block so a later block can restate them
  - lint bans in src/sim for for..in, bare and undefined-argument sort/toSorted, Math aliasing, Reflect.get/apply, sort via call/apply/bind, Date, timers, queueMicrotask, process, crypto, globalThis, self, Intl, localeCompare, eval, new Function and implied eval
  - tests/guards/sim-probe.ts withSimProbe(relativePath, source, body)
  - tests/guards/sim-determinism-bans.test.ts, 45 failing probes and 8 positive controls
  - tests/guards/entity-id-scope.test.ts, the per-world entity-id source-scan guard (FOUND-11, RESEARCH A8)
affects: [08-02, 08-05, 08-09, 08-13, 08-15]

actuals:
  tokens: 11800
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "rule lists as named constants that a later ESLint block must spread, because ESLint replaces rather than merges a redefined rule"
    - "generated guard probes live under src/sim only inside the probe lock, named __purity_*, with the SPDX header, and every created file and directory is removed deepest-first"
    - "table-driven ban proofs: one probe per construct asserts the rule id and a fragment of the stable configured message"
    - "source-scan guard with in-memory positive and negative controls plus a real-tree scan with a vacuity floor"

key-files:
  created:
    - tests/guards/sim-probe.ts
    - tests/guards/sim-determinism-bans.test.ts
    - tests/guards/entity-id-scope.test.ts
  modified:
    - eslint.config.js
    - tests/guards/sim-purity.test.ts

key-decisions:
  - "The per-world entity-id rule (CONTEXT D-06, amended 2026-11-12) is enforced by a source-scan test, not an ESLint ban: the scan also catches the EntityId type name and needs no new config block for non-sim code whose rule keys a later block would silently replace"
  - "toFixed and toPrecision stay legal in src/sim (the generator zone bans them) because src/sim/hash.ts canon formats through toFixed with a fixed digit count"
  - "no-eval, no-new-func and no-implied-eval are enabled as rules of their own in the src/sim block and are not part of the shared constants, so a later block that never redefines them inherits them"

patterns-established:
  - "Any later config block that redefines no-restricted-syntax, no-restricted-globals or no-restricted-properties for a src/sim subtree must spread the three SIM_* constants"
  - "A phase that must hold an entity id outside src/sim changes tests/guards/entity-id-scope.test.ts in the same commit as a Key Decisions row stating how the holder is cleared or re-keyed at every world boundary"

requirements-completed: [FOUND-12, FOUND-11]

coverage:
  - id: D1
    description: "src/sim lint rejects Math.random (dot and bracket), every Date value use, performance.now, timers, queueMicrotask, process, crypto, globalThis, self, Intl, for..in, bare and undefined-argument sort/toSorted, with positive controls proving the rules are not over-broad"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/guards/sim-determinism-bans.test.ts (53 tests: 45 failing probes, 8 positive controls)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The Math.random and sort bans cannot be sidestepped by the simple alias and reflection forms (Math binding or assignment, computed non-literal Math member, Reflect.get/apply dot and computed, sort via call/apply/bind dot and computed)"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/guards/sim-determinism-bans.test.ts (alias, Reflect and .sort.call/.apply/.bind probes)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The src/sim zone carries no-eval (direct and indirect), no-new-func, no-implied-eval, the Intl global ban and a localeCompare selector; toFixed stays legal"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/guards/sim-determinism-bans.test.ts (eval, (0, eval), new Function, Function, setTimeout string, Intl.Collator, localeCompare probes; toFixed control)"
        status: pass
    human_judgment: false
  - id: D4
    description: "withSimProbe writes probes only inside the probe lock with __purity_ names and the SPDX header and removes every created file and directory; sim-purity strips block comments and scans whole Frame declaration bodies"
    requirement: FOUND-12
    verification:
      - kind: unit
        ref: "tests/guards/sim-purity.test.ts (frame declaration scanning, 6 unit tests) and git status --porcelain -- src/sim empty after every run"
        status: pass
    human_judgment: false
  - id: D5
    description: "No source file outside src/sim imports src/sim/world/ids or names EntityId, with positive and negative controls and a 50-file vacuity floor"
    requirement: FOUND-11
    verification:
      - kind: unit
        ref: "tests/guards/entity-id-scope.test.ts (entity ids stay inside src/sim, 10 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Whole repository still lints clean and the full unit suite is green"
    requirement: FOUND-12
    verification:
      - kind: other
        ref: "docker compose run --rm lint (exit 0); docker compose run --rm test (109 files, 1515 passed, 1 skipped)"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-11-13
status: complete
plan_head_before: 033b8bbbd652f2321645e103227f4c33d74a456d
plan_head_after: 099e7a89c8438af93d0fc893ad0770da7bfa034c
---

# Phase 8 Plan 03: Determinism bans and the entity-id scope guard Summary

**src/sim lint now rejects every unseeded-randomness, wall-clock, timer, platform, locale, eval, for..in and bare-sort construct (alias and reflection forms included), each proven by a generated probe through the real config, plus a source-scan guard that keeps entity ids out of every file outside src/sim.**

## Performance

- **Duration:** about 13 min (the start time was not captured at spawn; derived from tool timestamps, first guard run 08:54Z, SUMMARY 09:01Z)
- **Tasks:** 3 (Task 1 tracer, Task 2 auto, Task 3 tdd)
- **Files modified:** 5 (3 created, 2 modified)
- **Diff size:** 1243 insertions, 79 deletions; `actuals.tokens` is chars/4 over that diff (47,127 chars)

## Accomplishments

- eslint.config.js declares `SIM_SYNTAX_BANS`, `SIM_GLOBAL_BANS` and `SIM_RESTRICTED_PROPERTIES` with a comment explaining why a later block must spread them (ESLint replaces, not merges); the src/sim block spreads all three and adds `no-eval`, `no-new-func`, `no-implied-eval`.
- The full ban set is proven by 45 failing probes (four repeated under `src/sim/world/` plus a `world/` timer probe, so syntax, global and property constants are shown to reach subdirectories) and 8 positive controls. No selector had to be adjusted for the container's ESLint: every selector in the plan passed its probe as written, so there is no original-versus-replacement pair to record.
- `withSimProbe` serialises probe writes behind `withProbeLock`, forces `__purity_` basenames, prepends the SPDX header and removes created files and directories deepest-first; `tests/guards/sim-purity.test.ts` now uses it, skips `__purity_*` entries, tolerates ENOENT, strips block comments, and scans a `*Frame*` declaration to its matching brace or semicolon (6 new unit tests).
- `tests/guards/entity-id-scope.test.ts` enforces the per-world id rule (CONTEXT D-06 as amended 2026-11-12) from wave 1, before ids.ts exists: 6 detection controls, 3 negative controls and a real-tree scan of 90 files.
- The residual forms lint cannot see are documented in eslint.config.js and in the guard header, with the behavioural proofs named (plan 08-02 pins and stream scan, plan 08-13 snapshot equality and cadence).

## Probe list (rule id and message fragment asserted)

Failing probes (all `status 1`):

| Probe | Rule | Fragment |
| --- | --- | --- |
| `Math.random()` | no-restricted-properties | seeded PRNG |
| `Math["random"]()` | no-restricted-properties | seeded PRNG |
| `Date.now()` | no-restricted-properties | No wall clock |
| `Date.UTC(2026, 0, 1)` | no-restricted-globals | No Date inside src/sim |
| `Date()` | no-restricted-globals | No Date inside src/sim |
| `new Date()` | no-restricted-syntax | No Date inside src/sim |
| `performance.now()` | no-restricted-properties | No wall clock |
| `setTimeout` with a callback | no-restricted-globals | No timers inside src/sim |
| `setInterval` with a callback | no-restricted-globals | No timers inside src/sim |
| `setImmediate` with a callback | no-restricted-globals | No timers inside src/sim |
| `queueMicrotask` with a callback | no-restricted-globals | No timers inside src/sim |
| `process.env` | no-restricted-globals | process environment |
| `crypto.getRandomValues` | no-restricted-globals | No platform randomness |
| `self.crypto.getRandomValues` | no-restricted-globals | must not reach the global object |
| `globalThis.Math.random()` | no-restricted-globals | must not reach the global object |
| bare `.sort()` | no-restricted-syntax | Bare .sort() |
| bare `.toSorted()` | no-restricted-syntax | Bare .toSorted() |
| `Array.prototype.sort.call` | no-restricted-syntax | via .call/.apply/.bind |
| `Array.prototype.sort.apply` | no-restricted-syntax | via .call/.apply/.bind |
| `Array.prototype.sort.bind` | no-restricted-syntax | via .call/.apply/.bind |
| `Reflect.get(Math, "random")` | no-restricted-syntax | Reflect.get or Reflect.apply |
| `Reflect["get"](Math, "random")` | no-restricted-syntax | Reflect.get or Reflect.apply |
| `Reflect.apply(Array.prototype.sort, ...)` | no-restricted-syntax | Reflect.get or Reflect.apply |
| `const m = Math; m.random()` | no-restricted-syntax | Do not alias Math |
| `const { random } = Math` | no-restricted-syntax | Do not alias Math |
| `m = Math` (assignment) | no-restricted-syntax | Do not alias Math |
| `const k = "random"; Math[k]()` | no-restricted-syntax | No computed Math member |
| `eval("1")` | no-eval | eval |
| `(0, eval)("Date.now()")` | no-eval | eval |
| `new Function("return 1")()` | no-new-func | Function |
| `Function("return 1")()` | no-new-func | Function |
| `setTimeout("1", 0)` | no-implied-eval | mplied eval |
| `new Intl.Collator("en")` | no-restricted-globals | Intl is locale/ICU-dependent |
| `localeCompare` comparator | no-restricted-syntax | localeCompare is ICU- and locale-dependent |
| `sort(undefined)` | no-restricted-syntax | Passing undefined to sort/toSorted |
| `toSorted(void 0)` | no-restricted-syntax | Passing undefined to sort/toSorted |
| computed `["sort"]()` | no-restricted-syntax | Bare .sort() |
| `Array.prototype["sort"].call` | no-restricted-syntax | via .call/.apply/.bind |
| `Array.prototype.sort["call"]` | no-restricted-syntax | via .call/.apply/.bind |
| `Array.prototype["sort"]["call"]` | no-restricted-syntax | via .call/.apply/.bind |
| `world/` for..in | no-restricted-syntax | for..in |
| `world/` bare `.sort()` | no-restricted-syntax | Bare .sort() |
| `world/` `Date.now()` | no-restricted-properties | No wall clock |
| `world/` `Math.random()` | no-restricted-properties | seeded PRNG |
| `world/` `setTimeout` | no-restricted-globals | No timers inside src/sim |
| for..in over an object (Task 1 proof, root) | no-restricted-syntax | for..in |

Positive controls (all `status 0`): numeric-comparator `sort`; numeric-comparator `toSorted` (receiver typed explicitly, see Deviations); comparator-sorted `Object.keys` list; direct `Math.floor(1.5) + Math.imul(3, 5)`; a `Date` used only as a parameter type in a function type; a `for..of` loop; `(1.5).toFixed(6)`; a comparator sort under `world/`. Task 1 also holds its own for..of control.

## Task Commits

1. **Task 1: shared rule constants, the for..in ban, the probe helper and its first guard proof (tracer)** - `0fd1c4c` (feat)
2. **Task 2: the full determinism ban set with positive controls** - `c0417c8` (feat)
3. **Task 3: entity-id scope guard** - `5a0b68c` (test, RED) then `099e7a8` (feat, GREEN)

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md (hash recorded by the orchestrator).

## Gate evidence

All gates ran in the main tree (`/home/opencode/git/wegolite`, not a worktree). Before each gate `git status --porcelain --untracked-files=all` listed only this plan's files and untracked `.planning/phases/08-*/.review-diagnostics/` directories. `docker ps` showed one `wegolite-preview-1` container, a long-running preview service from an earlier session that serves a built image and does not write `dist/` or `coverage/` during these runs; no test or lint run of another plan was active.

| Gate | Commit | Tree | Result |
| --- | --- | --- | --- |
| tracer re-verify: sim-determinism-bans + sim-purity + compliance tests, lint | `0fd1c4c` content (run just before the commit) | `947094fcf571926ab056056c41464bf9ad6ec1b0` | 33 passed (3 files); lint exit 0 |
| Task 2: both guard files, whole-repo lint | `c0417c8` content (run just before the commit) | `f40cb01c7aaafaa02409340df0e9d0abb5940898` | 68 passed (2 files); lint exit 0 |
| Task 3 RED (stub) | `5a0b68c` | `fc23f09bedaf5ee17b17623fd5e019fb5dca9e85` | 6 failed on the planned assertions (`expected [] to deeply equal [...]`), 4 passed |
| Task 3 GREEN and plan-level verification | `099e7a8` | `4cb0f0369cda728ec5b4540d5889ae46fd29e0fd` | entity-id-scope 10 passed; bans + entity-id + sim-purity 78 passed (3 files); full `docker compose run --rm test` 109 files, 1515 passed, 1 skipped; lint exit 0 on the identical file content just before the commit |

The Task 3 RED run is a hand-checked semantic assessment: the target tests executed and failed on the planned assertion (the stub returned no findings where the controls expect them); the negative controls and real-tree scan passed against the stub, as expected. `tdd_mode` is off, so no `check tdd-red-evidence` record was produced.

Acceptance criteria re-run:

- Task 1: `rg -c "SIM_SYNTAX_BANS|SIM_GLOBAL_BANS|SIM_RESTRICTED_PROPERTIES" eslint.config.js` printed 6; `rg -c "ForInStatement"` printed 1; `git status --porcelain -- src/sim` empty after the runs. PASS.
- Task 2: `arguments.length=0` 3; `"setImmediate"` 1; `init.name="Math"|right.name="Math"` 2; `"globalThis"` 1; `queueMicrotask` 1; `"self"` 1; `"no-eval": "error"` 2; `"no-new-func": "error"` 2; `callee.property.name="localeCompare"` 2; `"no-implied-eval": "error"` 1; `property.value=` 4; `"Intl"` 2; `__purity_` in sim-probe.ts 4; the guard imports `./eslint-gate.js` and `./sim-probe.js`; 45 failing cases and 8 controls (floors 42 and 7). PASS.
- Task 3: `findEntityIdLeaks` 11 occurrences; `D-06` 3; describe title 1; `rg -n "\bEntityId\b|sim/world/ids" src --glob '!src/sim/**'` printed nothing (exit 1); `git status --porcelain -- src` empty. PASS.

## Files Created/Modified

- `eslint.config.js` - three SIM_* constants with the replace-not-merge and residual-forms documentation; the src/sim block spreads them and enables no-eval, no-new-func, no-implied-eval
- `tests/guards/sim-probe.ts` - `withSimProbe`: lock, `__purity_` normalisation, SPDX header, created-directory tracking and cleanup
- `tests/guards/sim-determinism-bans.test.ts` - table-driven failing probes and positive controls
- `tests/guards/sim-purity.test.ts` - shared probe helper, `__purity_`/ENOENT-tolerant file walk, block-comment stripping, brace-matched Frame body scan, 6 unit tests
- `tests/guards/entity-id-scope.test.ts` - `findEntityIdLeaks` and the real-tree scan

## Decisions Made

- Entity-id scope is a source-scan test, not an ESLint ban (rationale in key-decisions above); no change to eslint.config.js for Task 3, and no probe lock is needed because it writes no file.
- The shared helper replaced sim-purity's private `withProbe` (kept as an alias) instead of leaving two copies of the probe-writing pattern.
- `entity-id-scope.test.ts` keeps its own comment stripper rather than importing sim-purity's, so the two guards stay independent as the plan asked.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] toSorted positive control tripped type-aware lint**
- **Found during:** Task 2 (first run of the guard)
- **Issue:** `[3, 1, 2].toSorted((a, b) => a - b)` failed `@typescript-eslint/no-unsafe-call` and `no-unsafe-assignment` because the project's TS lib predates `toSorted`, so the control failed for the wrong reason, not because of the ban.
- **Fix:** the control types its receiver through a local `Sortable` interface (`as unknown as Sortable`), so the only thing under test is that a comparator is present. No ESLint selector changed.
- **Files modified:** tests/guards/sim-determinism-bans.test.ts
- **Verification:** the control lints with status 0; the failing `toSorted` probes still fail with the bare-sort message.
- **Committed in:** `c0417c8`

**2. [Rule 3 - Blocking] Prettier rejected the new test file**
- **Found during:** Task 1 (`docker compose run --rm lint`)
- **Fix:** ran `prettier --write` in the lint container on the new and changed files (a formatting-only change; the table rows in the bans test were reflowed).
- **Committed in:** `0fd1c4c`, `c0417c8`, `099e7a8`

### Additions beyond the plan floors (not deviations in intent)

- Extra probes: `setTimeout("1", 0)` for `no-implied-eval`, `Array.prototype["sort"]["call"]` for the fully computed form, a `world/` timer probe, and a `world/` comparator-sort control.
- `no-implied-eval` is exercised only through the string-argument timer form; the `no-restricted-globals` timer ban fires on the same line, so both rules are asserted separately by rule id.

**Total deviations:** 2 auto-fixed (1 Rule 1, 1 Rule 3). **Impact on plan:** none on scope; the first only changes how a control is typed.

## Issues Encountered

None. Every selector in the plan passed its probe on the first run; no selector was adjusted for the container's ESLint.

## Known Stubs

None.

## Threat Flags

None. The plan adds guards only; no network endpoint, auth path or file-access surface changed. T-08-05, T-08-06, T-08-38, T-08-48 and T-08-59 are mitigated as planned; the documented residual (an id carried as an untyped number, Math passed as a call argument, comparator totality) stays with plan 08-15's lifecycle test, plan 08-02 and plan 08-13.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 08-05 (ids.ts, store), 08-09 (AI zone: must spread the three SIM_* constants and re-prove the bans) and 08-15 (world lifecycle) can rely on these guards being in force.
- CHANGELOG: build tooling only, no entry (per the plan).
- deferred-items.md D-1 (stale docked nav assertions) was resolved by commit 033b8bb; this plan did not touch that file.

## Self-Check: PASSED

- Created files present: `tests/guards/sim-probe.ts`, `tests/guards/sim-determinism-bans.test.ts`, `tests/guards/entity-id-scope.test.ts` (FOUND).
- Commits present on HEAD: `0fd1c4c`, `c0417c8`, `5a0b68c`, `099e7a8` (FOUND); `git rev-list --count 033b8bb..HEAD` = 4.
- `git status --porcelain --untracked-files=all -- src` empty (no probe left behind).
