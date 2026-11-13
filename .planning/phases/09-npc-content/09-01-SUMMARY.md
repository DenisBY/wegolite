---
phase: 09-npc-content
plan: 01
subsystem: content
tags: [oolite, vendoring, provenance, npc-ships, assets]
status: complete
requires:
  - phase: 02-content-pipeline
    provides: scripts/vendor-oolite.sh, the ASSETS.md and CHECKSUMS.sha256 provenance path, pin 7437f22
provides:
  - 42 vendored source files (9 .dat models, 33 PNG maps) for the nine NPC role ships under third_party/oolite/
  - 42 ASSETS.md rows and 42 CHECKSUMS.sha256 lines written by the script
  - byte-identity cross-check report against the Oolite checkout (checked=42 mismatches=0)
affects: [09-02, 09-03, 09-04, 09-05]
plan_head_before: c8f9f320856e0c504919236cf3e878ed97814e0c
plan_head_after: 19eed9910c5d00f95cc526b5c77c707be499c36a
actuals:
  tokens: 16500
  tasks: 3
  commits: 2
tech-stack:
  added: []
  patterns:
    - "vendoring tracer: one ship through script, rows, compliance gate and checkout cross-check, then the rest"
key-files:
  created:
    - third_party/oolite/Models/oolite_adder.dat
    - third_party/oolite/Models/oolite_cobramk1.dat
    - third_party/oolite/Models/oolite_gecko.dat
    - third_party/oolite/Models/oolite_krait.dat
    - third_party/oolite/Models/oolite_mamba.dat
    - third_party/oolite/Models/oolite_moray.dat
    - third_party/oolite/Models/oolite_shuttle.dat
    - third_party/oolite/Models/oolite_sidewinder.dat
    - third_party/oolite/Models/oolite_viper.dat
    - "33 PNG maps under third_party/oolite/Textures/ (adder, cobramk1, gecko, krait, mamba, moray, shuttle, sidewinder, viper)"
  modified:
    - scripts/vendor-oolite.sh
    - ASSETS.md
    - third_party/oolite/CHECKSUMS.sha256
key-decisions:
  - "Network fetch through scripts/vendor-oolite.sh at 7437f22 and the host-shell read-only cross-check are the two recorded exceptions to AGENTS.md; plan 09-05 Task 3 writes both into PROJECT.md Key Decisions."
requirements-completed: [DATA-10]
coverage:
  - id: D1
    description: "42 NPC source files vendored at 7437f22 with one script-written ASSETS.md row and one CHECKSUMS line each"
    requirement: DATA-10
    verification:
      - kind: unit
        ref: "tests/compliance-assets.test.ts, tests/compliance.test.ts (docker compose run --rm test npx vitest run)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every vendored file is byte-identical to the Oolite checkout at 7437f22 and in its working tree"
    requirement: DATA-10
    verification:
      - kind: other
        ref: "sh /tmp/wegolite-09-01/crosscheck.sh -> checked=42 mismatches=0"
        status: pass
    human_judgment: true
    rationale: "Plan Task 3 requires the owner's confirmation of the network-vs-checkout report; delegated to the orchestrator, pending."
  - id: D3
    description: "The content build is unaffected by the new inputs"
    requirement: DATA-10
    verification:
      - kind: integration
        ref: "docker compose run --rm assets npm run assets:check -> no differences"
        status: pass
    human_judgment: false
---

# Phase 9 Plan 01: Vendor the NPC role ships Summary

42 source files of the nine NPC role ships (Viper, Adder, Moray, Cobra Mk I, Sidewinder, Mamba, Krait, Gecko, Shuttle) vendored at Oolite commit `7437f22` through the sanctioned `scripts/vendor-oolite.sh`, each with a script-written ASSETS.md row and checksum, and every file confirmed byte-identical to the local Oolite checkout.

## Run record

| Item | Value |
| --- | --- |
| PLAN_BASE | `c8f9f320856e0c504919236cf3e878ed97814e0c` |
| Plan head after | `19eed9910c5d00f95cc526b5c77c707be499c36a` |
| Script run date | 2026-11-13 (Task 1 and Task 2 runs; each completed on the first attempt, no retry) |
| Started / duration | 2026-11-13T22:31:00Z, about 3 min of tool time |
| Tasks | 3 (2 committed, 1 checkpoint handled per orchestrator delegation) |
| Files | 43 under `third_party/` (42 new, `CHECKSUMS.sha256` changed), plus `ASSETS.md` and `scripts/vendor-oolite.sh` |

## Task commits

| Task | Commit | Result |
| --- | --- | --- |
| 1 (tracer) Viper end to end | `853c544` | 3 files, cross-check `checked=3 mismatches=0`, Vitest 28 passed |
| 2 Other eight ships | `19eed99` | 39 files, cross-check `checked=42 mismatches=0`, Vitest 45 passed, `assets:check` no differences |
| 3 Owner checkpoint | none (no code) | all cross-checks clean; checkpoint pending orchestrator confirmation: all hash cross-checks clean |

## Cross-check and diff results (exact outputs)

- `/tmp/wegolite-09-01/crosscheck.txt`: 42 `MATCH` lines, no `MISMATCH`, last line `checked=42 mismatches=0`. Each line compares the recorded digest with `git -C /home/opencode/git/oolite show 7437f22:Resources/<path> | sha256sum` and with `sha256sum` of the checkout's working-tree file; all three agree.
- Task 1 report before expansion: `checked=3 mismatches=0`.
- `git diff --numstat $PLAN_BASE HEAD -- third_party/oolite/CHECKSUMS.sha256`: `42  0` (42 lines added, none removed). `CHECKSUMS.sha256` holds 117 lines (75 before).
- `git diff --shortstat $PLAN_BASE HEAD -- third_party`: `43 files changed` (42 new files and `CHECKSUMS.sha256`).
- `pin.json`: no diff against `$PLAN_BASE`.
- `scripts/vendor-oolite.sh` diff: only added `Models/` and `Textures/` FILES lines (42); RELEASE, COMMIT, RETRIEVED, BASE_URL and both node blocks unchanged.
- `ASSETS.md`: 118 `third_party/oolite/` rows (76 before); no `pending` placeholder left; every new row reviewed for path, URL segment, cells and placeholder before the script run.
- No sound, Python, variant (`_alt`, `_miner`, `_escort`, `_med`, `_pursuit`, interceptor) or other out-of-scope file under `third_party/` or `public/`.
- Spot check: `oolite_viper.dat` digest `11892066baf8f60fa1f4ff9a0479559a9ec8f52db522f061fd669e6cef10914e` from both the vendored file and `git show 7437f22:`.
- Verification: `docker compose run --rm test npx vitest run tests/compliance-assets.test.ts tests/compliance.test.ts tools/oolite-ingest/convert/textures.test.ts` 3 files, 45 tests passed; `docker compose run --rm assets npm run assets:check` printed `assets:check: no differences`.

## Checkpoint (Task 3)

Per the orchestrator's delegation (owner asleep), every cross-check the checkpoint lists was run and recorded above; none showed a mismatch, failure or ambiguity. Checkpoint pending orchestrator confirmation: all hash cross-checks clean. The two exceptions the checkpoint asks the owner to confirm (network fetch through the sanctioned script at `7437f22` for these 42 files with mandatory cross-check; host-shell run of the read-only cross-check because the `wegolite-ci` image has no `git`) remain for plan 09-05 Task 3 to record in `.planning/PROJECT.md` Key Decisions.

## Deviations from Plan

None - plan executed exactly as written. The ASSETS.md and FILES insertions were done with a scratch helper under `/tmp/wegolite-09-01/` (not in the repository) instead of a delegated subagent; the rows were reviewed programmatically before the script run.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema; the only network use is the sanctioned script's unauthenticated GETs (T-09-05, accepted).

## Notes for later plans

- `NOTICE` was not edited by this plan (it is not in `files_modified`); it describes the vendored textures as a group. Plan 09-05 or the plan that first ships generated NPC assets should check whether it needs a per-ship line.
- No `CHANGELOG.md` entry: vendoring inputs is internal, with no user-visible change until a later plan emits and loads them.

## Self-Check: PASSED

- 42 vendored files present under `third_party/oolite/` (9 `.dat`, 33 `.png`): FOUND.
- Commits `853c544` and `19eed99` are ancestors of HEAD: FOUND.
- Plan-level verification (Vitest compliance and textures files, cross-check `checked=42 mismatches=0`, `assets:check`): PASSED.
