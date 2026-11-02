---
phase: 01-foundation-containers-compliance
plan: 05
subsystem: compliance
tags: [licensing, gpl-2.0-or-later, cc-by-nc-sa-3.0, attribution, provenance, trademarks, spdx, documentation]

# Dependency graph
requires:
  - "01-01: the seven-service compose topology, ports 5173/4173 and the verify chain this README documents"
  - "01-02: the `unit` Vitest project and the `lint` gate (eslint + prettier --check) the compliance test joins"
  - "01-04: the completed precision shell whose `index.html` carries the shipped footer disclaimer"
provides:
  - "LICENSE: byte-for-byte GNU GPL v2 text (md5 570a9b3749dd0463a1778803b12a6dce)"
  - "NOTICE: GPL-2.0-or-later election, Oolite attribution, CC BY-NC-SA 3.0 option for art/config, source offer, non-affiliation paragraph"
  - "ASSETS.md: eight-column provenance contract, seeded with zero asset rows"
  - "tests/compliance.test.ts: 10 assertions pinning the shipped artefacts, including the tree-wide S-6 SPDX walk"
  - "README.md: the published command contract and the four operational traps"
  - "AGENTS.md: ports, volume-refresh rule, VITE_USE_POLLING opt-in and the bind-mount note"
  - "public/.gitkeep: static asset root reserved, no assets added"
affects: [02-content-compiler, 03-flight-model, 04-world-rendering, 05-station-screens, 06-navigation, 07-quality]

# Actuals (#2632) — chars/4 over the realized diff (36,020 chars)
actuals:
  tokens: 9005
  tasks: 3
  commits: 3
  plan_head_before: 293e538db057a3438f1bc50bba66fa56e50bf337
  plan_head_after: 833188245b28813fce724531b6077d05d710c4bd

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixture checksums (md5 of LICENSE) live in a test that says so; they are drift detectors, never security controls, and stay separate from the FNV-1a sim hash"
    - "Prose assertions normalise whitespace (`replace(/\\s+/g, \" \")`) so a Prettier re-wrap cannot break a text-content check"
    - "Compliance reads source `index.html`, not `dist/`, because `verify` runs `test` before `build`"
    - "The S-6 SPDX walk has a vacuity guard (>= 8 files) and skips the `__purity_*` probes the guard test writes at runtime"

key-files:
  created:
    - LICENSE
    - NOTICE
    - ASSETS.md
    - tests/compliance.test.ts
    - README.md
    - public/.gitkeep
  modified:
    - AGENTS.md

key-decisions:
  - "LICENSE was fetched inside the container from the byte-identical Wayback snapshot of the canonical gnu.org URL (see Deviations), because gnu.org itself returned 403 to Node's fetch and then timed out; the md5 still has to be, and is, 570a9b3749dd0463a1778803b12a6dce."
  - "NOTICE states the election in words rather than appending an \"or later\" clause to LICENSE: the licence text must stay byte-for-byte canonical, so the election belongs in the notice (and in each file's SPDX header)."
  - "The compliance test matches NOTICE and ASSETS.md text after whitespace normalisation, the same mechanism used for index.html, so formatting is decoupled from content assertions."
  - "The SPDX walk skips basenames starting with `__purity_`: `tests/guards/sim-purity.test.ts` writes those probes into `src/sim/` at run time and deletes them again, so they are not source files."
  - "README bullets are written as single lines because Prettier's preserve mode reflowed a wrapped bullet into a broken list continuation."

requirements-completed: [FOUND-06, FOUND-09, FOUND-03]

coverage:
  - id: D1
    description: "LICENSE is the canonical GNU GPL version 2 text, unmodified, and any drift fails the suite"
    requirement: FOUND-06
    verification:
      - kind: unit
        ref: "tests/compliance.test.ts#LICENSE > is the canonical GNU GPL version 2 text, unmodified"
        status: pass
      - kind: integration
        ref: "docker compose run --rm test md5sum LICENSE -> 570a9b3749dd0463a1778803b12a6dce"
        status: pass
    human_judgment: false
  - id: D2
    description: "NOTICE records the GPL-2.0-or-later election, Oolite attribution, the CC BY-NC-SA 3.0 option for Oolite art and configuration, the corresponding-source offer and the non-affiliation paragraph"
    requirement: FOUND-06
    verification:
      - kind: unit
        ref: "tests/compliance.test.ts#NOTICE (4 cases: election, attribution, CC BY-NC-SA 3.0, source + disclaimer)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ASSETS.md publishes the eight-column provenance contract with zero asset rows and states that no asset may be committed without a row"
    requirement: FOUND-06
    verification:
      - kind: unit
        ref: "tests/compliance.test.ts#ASSETS.md > publishes the provenance column contract"
        status: pass
    human_judgment: false
  - id: D4
    description: "The shipped shell renders the non-affiliation disclaimer, and neither <title> nor package.json name carries an elite/oolite mark"
    requirement: FOUND-06
    verification:
      - kind: unit
        ref: "tests/compliance.test.ts#shipped shell (3 cases: disclaimer text, package name, title)"
        status: pass
      - kind: e2e
        ref: "tests/e2e/precision.spec.ts#footer toContainText (run by docker compose run --rm verify)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every source file in the tree carries the S-6 SPDX header, enforced by a tree-wide walk with a vacuity guard"
    requirement: FOUND-06
    verification:
      - kind: unit
        ref: "tests/compliance.test.ts#licence headers > puts the S-6 SPDX header on every source file"
        status: pass
    human_judgment: false
  - id: D6
    description: "README.md and AGENTS.md document the container-only workflow with the exact service names, both ports, verify as the only definition of done, the volume-refresh rule, the polling opt-in and the bind-mount"
    requirement: FOUND-09
    verification:
      - kind: integration
        ref: "grep assertions over README.md/AGENTS.md (verify, 5173, 4173, down --volumes, VITE_USE_POLLING, bind-mount, definition of done) + docker compose run --rm lint"
        status: pass
    human_judgment: false
  - id: D7
    description: "The licence, attribution and trademark wording is legally sufficient"
    requirement: FOUND-06
    verification: []
    human_judgment: true
    rationale: "The suite asserts presence and trademark absence, never legal adequacy. 01-VALIDATION.md Manual-Only row 4 and STATE.md both carry the outstanding professional legal read before the first public post."

# Metrics
duration: 9min
completed: 2026-11-02
status: complete
---

# Phase 01 Plan 05: Foundation, Containers & Compliance Summary

**GPL-2.0-or-later election, Oolite CC BY-NC-SA 3.0 attribution, an empty provenance registry and a trademark-clean shipped shell, all pinned by ten compliance assertions, plus the README/AGENTS command contract that makes `docker compose run --rm verify` the project's only definition of done.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-02T18:19:26Z
- **Completed:** 2026-11-02T18:28:37Z
- **Tasks:** 3
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- `LICENSE` is the canonical GNU GPL version 2 text — 17,984 bytes, 338 lines, md5 `570a9b3749dd0463a1778803b12a6dce` — fetched in-container, never retyped, and re-checked by the suite on every run.
- `NOTICE` carries the four required statements in order: the `GPL-2.0-or-later` election in words, the Oolite attribution (`Copyright © 2004-2026 Giles C Williams, Jens Ayton and contributors`, GPL v2 or later), the CC BY-NC-SA 3.0 option for Oolite artwork *and* configuration files with the canonical URI, and the corresponding-source offer — closing with the non-affiliation paragraph copied from `index.html`.
- `ASSETS.md` seeds the eight-column provenance contract (`Path | Kind | Origin | Source URL | Author / Copyright | Licence | Modifications | SHA-256`) with zero rows, so the first Phase 2 asset has somewhere mandatory to land.
- `tests/compliance.test.ts` adds ten assertions: the licence md5, four NOTICE cases, the ASSETS header row, the normalised footer disclaimer, a trademark-clean `<title>` (extracted, not grepped wholesale) and `package.json` name, and a tree-wide S-6 SPDX walk guarded against an empty result.
- `README.md` publishes every Compose command with the same service vocabulary as `AGENTS.md`, both ports, `verify` as the only definition of done, the `down --volumes` refresh, the `VITE_USE_POLLING` opt-in, the root-Chromium posture and the bind-mount; `AGENTS.md` gains the same operational facts without weakening a single existing rule.
- `docker compose run --rm verify` is green end to end (lint → typecheck → test → build → e2e); `test` reports 5 files / 19 tests passing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fetch the canonical GPL text and author NOTICE and ASSETS.md** — `add08d9` (feat)
2. **Task 2: Add the compliance test that pins the shipped artefacts** — `f659cc1` (feat)
3. **Task 3: Publish the command contract in README and extend AGENTS** — `8331882` (docs)

**Plan metadata:** this SUMMARY commit (docs).

## Files Created/Modified

- `LICENSE` — verbatim GNU GPL v2 text; the "or later" election is deliberately absent from it
- `NOTICE` — project copyright and election, Oolite attribution, CC BY-NC-SA 3.0 carve-out, source offer, non-affiliation/trademark paragraph, and the "not legal advice" caveat
- `ASSETS.md` — provenance rule plus the eight-column contract, seeded empty
- `tests/compliance.test.ts` — ten assertions across LICENSE, NOTICE, ASSETS.md, the shipped shell and the source tree
- `README.md` — command table, operational notes, repository layout, licensing pointers
- `AGENTS.md` — ports in the quick reference, `down --volumes` beside the rebuild step, polling opt-in, bind-mount note
- `public/.gitkeep` — reserves the static asset root; Phase 1 adds no assets

## Decisions Made

- The election is recorded in `NOTICE` and in each file's SPDX header, never by appending to `LICENSE`: the licence text has to stay byte-identical to the FSF original.
- Prose assertions run against whitespace-normalised text. Prettier owns line wrapping, and `lint` ends with `prettier --check .`, so byte-level text matching would make the suite a formatting test.
- The compliance test reads `index.html`, not `dist/index.html`, because `verify` runs `test` before `build`; the built bundle stays covered by the Playwright spec, which serves it through `vite preview`.
- The SPDX walk treats `__purity_*` basenames as non-source: they are the transient probes the sim-purity guard test writes and removes inside `src/sim/`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] gnu.org was unreachable from the container, so the licence was fetched from a byte-identical snapshot**
- **Found during:** Task 1 (licence fetch)
- **Issue:** `fetch('https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt')` inside the `test` service returned `HTTP 403` to Node's `undici`, then `UND_ERR_CONNECT_TIMEOUT`; a browser user-agent and host-side `curl` both timed out as well, so the canonical URL itself was unavailable.
- **Fix:** fetched the same URL through the Wayback Machine's raw snapshot (`https://web.archive.org/web/2024id_/https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt`) from inside the `test` container and wrote it to the bind-mounted working tree. The `id_` suffix returns the archived body unmodified.
- **Verification:** `docker compose run --rm test md5sum LICENSE` → `570a9b3749dd0463a1778803b12a6dce`, exactly the hash the plan pins, at 17,984 bytes / 338 lines. The compliance test re-checks it on every run, so a wrong or reflowed file cannot pass.
- **Committed in:** `add08d9`

**2. [Rule 3 - Blocking] NOTICE and ASSETS.md were formatted during Task 1, not Task 3**
- **Found during:** Task 1 (preparing the tree for the Task 2 lint gate)
- **Issue:** Task 2's `<verify>` runs `docker compose run --rm lint`, which ends with `prettier --check .`. Task 3 is where the plan schedules the Markdown formatting pass, so the lint gate would have gone red for files Task 1 wrote.
- **Fix:** ran `docker compose run --rm lint npx prettier --write ASSETS.md NOTICE` at the end of Task 1; reapplied the same command to `README.md`/`AGENTS.md` in Task 3 as planned.
- **Verification:** `docker compose run --rm lint` green after each task; `LICENSE` stayed untouched (it is already in `.prettierignore`).
- **Committed in:** `add08d9` (ASSETS.md/NOTICE), `8331882` (README.md/AGENTS.md)

**3. [Rule 1 - Bug] The tree-wide SPDX walk raced the sim-purity guard test**
- **Found during:** Task 2 (designing the walk)
- **Issue:** `tests/guards/sim-purity.test.ts` writes `src/sim/__purity_three_probe.ts` and `src/sim/__purity_dom_probe.ts` at run time and removes them in a `finally`. Vitest runs test files in parallel, so the compliance walk could legitimately observe a probe with no licence header and fail non-deterministically.
- **Fix:** the walk skips basenames starting with `__purity_`, with a comment naming the guard test as the reason.
- **Verification:** `docker compose run --rm test` (full suite, 19 tests) and `docker compose run --rm verify` both green; no probe file survives a run.
- **Committed in:** `f659cc1`

**4. [Rule 1 - Bug] A wrapped README bullet broke the documented-command assertion**
- **Found during:** Task 3 (task `<verify>`)
- **Issue:** Prettier reflowed the "definition of done" bullet across a line break, so `grep -q 'definition of done' README.md` failed, and its re-flow also de-indented a continuation line into a broken list item.
- **Fix:** rewrote the operational notes as single-line bullets (Prettier's preserve mode does not wrap them) and used the phrase inside one line.
- **Verification:** all six README greps and all five AGENTS greps pass; `docker compose run --rm lint` green.
- **Committed in:** `8331882`

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bugs).
**Impact on plan:** No scope change and no weakened assertion — the licence hash is the plan's, and every gate still fails on drift. Two deviations are ordering/formatting consequences of `lint` owning formatting, one is a genuine concurrency hazard the plan could not foresee, and one is the licence fetch taking a byte-identical fallback path because gnu.org was down.

## Prohibition Review (plan `prohibitions`, flagged for human judgment)

- The product identity is trademark-clean: `grep -rniE '\b(elite|oolite)\b' index.html package.json` matches only the two footer lines of the disclaimer, and the compliance test extracts `<title>` specifically so a `Oolite clone` title would fail while the footer passes.
- Nothing implies affiliation, endorsement or connection: `index.html`, `NOTICE` and `README.md` all state "unofficial fan project" and name Frontier Developments plc, David Braben and Ian Bell.
- The GPL corresponding-source offer is published in `NOTICE` §4 as the repository URL, not withheld.
- Oolite art and configuration are never presented as independently licensed: `NOTICE` §3 names CC BY-NC-SA 3.0 as the option Wegolite takes, states that those files are never relicensed under the GPL, and `ASSETS.md` requires a provenance row per asset.
- Legal adequacy of the wording is explicitly **not** asserted by the suite; it remains a human decision (coverage `D7`, `01-VALIDATION.md` Manual-Only row 4).

## Issues Encountered

- gnu.org served `403` to Node's undici and then stopped responding to every client tried, including host `curl`; the Wayback snapshot was the reliable route to identical bytes. Worth retrying the canonical URL in CI, where egress differs, before the first release.
- `LICENSE` is owned by `root` on the host because the container wrote it through the bind mount. Git tracks it fine and it is in `.prettierignore`, so nothing rewrites it; a contributor on a different machine will simply own their own copy.
- Vite still warns about the 533 kB single JS chunk. Unchanged since wave 1 and non-fatal.

## Known Stubs

None.

## Threat Flags

None — this plan adds no endpoint, auth path, file-access boundary or schema change. T-01-13 (`<title>`/package name) is mitigated by the extracted-title assertion; T-01-14 (`LICENSE` tampering) by the md5; T-01-15 (`ASSETS.md` deletion) by the header-row assertion; T-01-SC holds — no dependency was added or changed.

## Next Phase Readiness

- Ready for plan 01-06: the clean-checkout rehearsal can now assert that the documented command table matches the Compose services, and the seeded fail-fast test is the last outstanding FOUND-03 evidence.
- FOUND-06 is pinned by automation for presence and trademark absence; the professional legal read remains open in `STATE.md` and is the phase's one deliberate human gate.
- `public/` exists and is empty, so Phase 2's content compiler has a declared asset root whose provenance registry is already in force.

---

*Phase: 01-foundation-containers-compliance*
*Completed: 2026-11-02*
