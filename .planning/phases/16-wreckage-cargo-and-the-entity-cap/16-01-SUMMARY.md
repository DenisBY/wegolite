---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 01
subsystem: content-vendoring
tags: [vendoring, provenance, debris-assets, data-16, oc-7, local-checkout]
status: complete

requires:
  - phase: 09-npc-content
    provides: "scripts/vendor-oolite.sh as the single authority for vendored bytes, the ASSETS.md row precedent (rows by hand, digests by the script)"
provides:
  - "scripts/vendor-oolite.sh --export-pin <checkout> <out-dir>: host-only export of the pinned commit's git blobs plus pinned.sha256"
  - "OOLITE_LOCAL / OOLITE_PINNED_SHA256 local-source mode: copies from the export, verifies every byte against the pinned list, refuses any change of a committed digest"
  - "14 vendored debris sources under third_party/oolite/: Models/oolite_alloy.dat, oolite_barrel.dat, wreck1..wreck5.dat; Textures/oolite_alloy_diffuse.png, oolite_barrel_{diffuse,normal,specular}.png, wreck.png, oolite-particle-{cloud2,flash}.png"
affects: [16-03, 16-05, 16-09]

plan_head_before: aa2cde67ed8a7b0cdee0c6c0c3a559ac9f21fb33
plan_head_after: 8b5cd651733a0d04a8c5d94124f8ca8738e57a53
commits: 2

actuals:
  tokens: 12400
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Verify all, then write: the local mode checks every path (pinned digest, committed digest) before the first byte is written"
    - "Bytes from the pin, never the working tree: the export reads git blobs at the full commit SHA, because the checkout's working tree has moved (descriptions.plist differs)"

key-files:
  created:
    - third_party/oolite/Models/oolite_alloy.dat
    - third_party/oolite/Models/oolite_barrel.dat
    - third_party/oolite/Models/wreck1.dat
    - third_party/oolite/Models/wreck2.dat
    - third_party/oolite/Models/wreck3.dat
    - third_party/oolite/Models/wreck4.dat
    - third_party/oolite/Models/wreck5.dat
    - third_party/oolite/Textures/oolite-particle-cloud2.png
    - third_party/oolite/Textures/oolite-particle-flash.png
    - third_party/oolite/Textures/oolite_alloy_diffuse.png
    - third_party/oolite/Textures/oolite_barrel_diffuse.png
    - third_party/oolite/Textures/oolite_barrel_normal.png
    - third_party/oolite/Textures/oolite_barrel_specular.png
    - third_party/oolite/Textures/wreck.png
  modified:
    - scripts/vendor-oolite.sh
    - ASSETS.md
    - third_party/oolite/CHECKSUMS.sha256

key-decisions:
  - "D16-02 implemented: vendor-oolite.sh gains a host --export-pin mode and a container OOLITE_LOCAL/OOLITE_PINNED_SHA256 mode; the network mode is unchanged"
  - "OC-7: the real vendoring run was performed by the orchestrator under the owner's standing instruction to finish the phase unattended, not by the owner; flagged for owner review"
  - "Local mode also refuses a pinned list whose commit line is not 7437f22, an out-dir inside the repository, and a committed CHECKSUMS entry whose file vanished"

patterns-established:
  - "Local vendoring route: sh scripts/vendor-oolite.sh --export-pin <checkout> <out-dir>, then the assets container run with the export mounted read-only, then prettier on ASSETS.md"

requirements-completed: []  # DATA-16 is half done: the NOTICE paragraphs come with the generated files in 16-03 and 16-05

duration: 5min
completed: 2026-11-16
---

# Phase 16 Plan 01: Debris Source Vendoring Summary

**The barrel, alloy and five wreck models, their textures and two explosion particle textures were vendored from the local Oolite checkout's pinned 7437f22 blobs. A new host-export mode plus a verified local-source mode in `scripts/vendor-oolite.sh` did it with no network fetch.**

## Performance

- **Duration:** about 5 min of executor time (plus the Task 2 checkpoint wait)
- **Started:** 2026-11-16T23:05:45Z
- **Completed:** 2026-11-16T23:10:15Z
- **Tasks:** 3 (1 tracer, 1 checkpoint, 1 verify)
- **Files modified:** 17 (14 created, 3 modified)

## Accomplishments

- `scripts/vendor-oolite.sh` has two vendoring sources:
  - The network mode, unchanged.
  - A local mode fed by `--export-pin` on the host. The container needs no `git`, and no Oolite byte is fetched.
- 14 debris sources were vendored with digests written by the script. `CHECKSUMS.sha256` went from 117 to 131 lines, all added. 14 new `ASSETS.md` rows were added and the `CHECKSUMS.sha256` row's digest was updated.
- The bytes were cross-checked against the pin and against the checkout's working tree. The compliance tests and the content drift gate pass.

## Task Commits

1. **Task 1: local-source vendoring, proven on a scratch copy (tracer)** - `2a0e018` (feat)
2. **Task 2: the real vendoring run (OC-7 checkpoint)** - no executor commit. The orchestrator ran the commands; their output went into Task 3's commit.
3. **Task 3: verify and record the vendored bytes** - `8b5cd65` (chore)

## Task 1 scratch proof (tracked tree untouched)

- **Host export:** `sh scripts/vendor-oolite.sh --export-pin /home/opencode/git/oolite /tmp/oolite-pin-16` exited 0.
  - It exported 128 files. `pinned.sha256` has 129 lines and its first line is `# commit 7437f22a543c442830774dea0f2cad4e59c04cbb`.
  - The pinned `Config/descriptions.plist` blob (`53ede265…`) equals the committed digest. The checkout's working tree copy is `29a16a6a…`. This confirms why bytes must come from the pin.
- **Positive run** on `/tmp/vendor-dry-16`: **exit 0**, 128 `vendor-oolite: copied` lines, no `HTTP` or `fetched` line.
  - The scratch `CHECKSUMS.sha256` differs from the tracked one by exactly **14 added lines**, with none removed.
  - The scratch `ASSETS.md` has **14 filled digest cells**. The only other changed row is `CHECKSUMS.sha256`. The `pin.json` digest is unchanged.
- **Negative 1** (one byte of `Models/wreck1.dat` flipped in a copy of the export): **exit 1**. Message: `vendor-oolite: Models/wreck1.dat: SHA-256 f512433b… does not match the pinned 2051c293…`. Nothing was written to the scratch tree.
- **Negative 2** (committed digest line for `Models/oolite_viper.dat` changed while the file stayed the same): **exit 1**. Message: `vendor-oolite: committed digest changed for: third_party/oolite/Models/oolite_viper.dat`. The copy step's pre-write check caught it; nothing was written.
- **Extra negative 3** (committed digest of `SOURCE.md` changed; this file is not in `FILES`): **exit 1** from the checksum block's local-mode check, naming `third_party/oolite/SOURCE.md`. `CHECKSUMS.sha256` and `ASSETS.md` were not touched.
- **Argument checks:**
  - Only `OOLITE_LOCAL` set: exit 1, naming both variables.
  - `--export-pin` with a missing argument: usage line and exit 2.
  - Out-dir inside the repository: exit 1.
  - A checkout without the commit: exit 1.
- **Gates:** `sh -n` OK, `prettier --check ASSETS.md` OK, full `docker compose run --rm lint` OK. `git status --porcelain third_party/` was empty after Task 1.

## Task 2: who ran the vendoring (OC-7)

**The orchestrator ran the real vendoring run, not the owner.** It acted under the owner's standing instruction to finish the phase unattended, and ran the three commands exactly as listed in the checkpoint:

1. `sh scripts/vendor-oolite.sh --export-pin /home/opencode/git/oolite /tmp/oolite-pin-16`
2. `docker compose run --rm -v /tmp/oolite-pin-16:/oolite-pin:ro -e OOLITE_LOCAL=/oolite-pin/Resources -e OOLITE_PINNED_SHA256=/oolite-pin/pinned.sha256 assets sh scripts/vendor-oolite.sh`
3. `docker compose run --rm lint npx prettier --write ASSETS.md`

The orchestrator reported:
- Command 2 exited 0 with 128 copied lines and no HTTP or `fetched` line.
- Prettier left `ASSETS.md` unchanged.
- `git status` showed the 14 new files plus the modified `CHECKSUMS.sha256` and `ASSETS.md`.

**OC-7 stays flagged for owner confirmation.** The owner should review commit `8b5cd65` and confirm the run after the fact. Plan 16-09 records OC-7 as a Key Decisions row.

## Task 3 cross-check

- **Against the pinned blobs** (`git cat-file blob 7437f22a543c442830774dea0f2cad4e59c04cbb:Resources/<path>`): **checked=14 mismatches=0**
- **Against the checkout's working tree** (`/home/opencode/git/oolite/Resources/<path>`): **checked=14 mismatches=0**
- **CHECKSUMS diff:** `git diff -U0 HEAD -- third_party/oolite/CHECKSUMS.sha256` showed 14 added lines and 0 removed. The file has 131 lines, and it is byte-identical to the scratch run's result.
- **Scope of the change under `third_party/`:** only `CHECKSUMS.sha256` changed among tracked files, plus the 14 new files. `pin.json` was unchanged.
- **ASSETS.md:** 14 new rows carry a 64-hex digest. The diff touches exactly 15 rows: the 14 new ones and the `CHECKSUMS.sha256` row.
- `docker compose run --rm test npx vitest run tests/compliance-assets.test.ts tests/compliance.test.ts`: 2 files, 28 tests passed.
- `docker compose run --rm assets npm run assets:check`: `assets:check: no differences` (exit 0).

## Files Created/Modified

- `scripts/vendor-oolite.sh`:
  - the `--export-pin` host mode;
  - the `OOLITE_LOCAL` / `OOLITE_PINNED_SHA256` local mode;
  - the committed-digest refusal in the checksum block;
  - 14 new `FILES` lines (128 in total, in code-unit order);
  - the rewritten header.
- `ASSETS.md`: 14 vendored-input rows (Oolite 1.93.1-241 @ 7437f22, CC BY-NC-SA 3.0, canonical raw URL at the pin). Their digests and the `CHECKSUMS.sha256` row's digest were written by the script.
- `third_party/oolite/CHECKSUMS.sha256`: 14 added lines.
- The 14 vendored files listed in the frontmatter.

## Decisions Made

- The pinned list must name commit 7437f22. An export of another commit is refused.
- The checksum block now builds `pin.json` in memory and hashes it before writing, so the local-mode refusal runs before the block writes any file. The network mode produces the same bytes as before.
- In local mode, a committed `CHECKSUMS.sha256` entry whose file vanished counts as a changed digest.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Stricter local-mode checks**
- **Found during:** Task 1
- **Issue:** The plan's checksum-block check runs after the copy step. A changed committed digest would therefore have been caught only after the bytes were overwritten on disk.
- **Fix:**
  - The copy step also compares each pinned digest with the committed `CHECKSUMS.sha256` entry, and writes nothing unless every path passes.
  - The pinned list's commit line must match 7437f22.
  - `--export-pin` refuses an out-dir inside the repository.
  - The local mode refuses when only one of the two environment variables is set.
- **Files modified:** `scripts/vendor-oolite.sh`
- **Commit:** `2a0e018`

**2. [Process] The orchestrator ran Task 2, not the owner**
- The owner's standing instruction covered it. It is recorded above and flagged for the owner under OC-7.

## Issues Encountered

None. Between commits `2a0e018` and `8b5cd65`, `tests/compliance-assets.test.ts` was expected to fail, because the 14 new rows named files that did not exist yet. Task 3 resolved it.

## Next Phase Readiness

- Plans 16-03 and 16-05 can now compile the barrel, alloy and wreck GLBs, the debris catalogue and the particle textures from the vendored bytes.
- The NOTICE paragraphs are still to come, with the generated files in 16-03 and 16-05.
- DATA-16 stays open until then.

## Self-Check: PASSED

- All 14 vendored files and the 3 modified files exist.
- Commits `2a0e018` and `8b5cd65` are ancestors of HEAD.
