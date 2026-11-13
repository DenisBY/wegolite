---
phase: 02-data-pipeline-content-compiler
plan: 08
subsystem: content-pipeline
tags:
  - determinism
  - eslint
  - cross-architecture
  - arm64
  - amd64
  - docker
  - buildx
  - negative-proof

requires:
  - phase: 02-data-pipeline-content-compiler
    provides: Plans 01-07's complete ingest pipeline, drift gate and emitted content tree
  - phase: 01-foundation
    provides: The sim purity zone whose `withProbe` harness and ESLint shape this plan mirrors

provides:
  - The tools/oolite-ingest determinism zone (banned Math/Date/Intl/localeCompare/toFixed/toPrecision/eval/new Function)
  - tests/guards/tools-determinism.test.ts, a five-case seeded negative proof
  - scripts/check-arch-determinism.sh, the single authority for the arm64/amd64 byte-identity claim, with an empty documented EXCLUSIONS section and a recorded Result line

affects:
  - 02-09 (any future ingest emitter inherits the zone automatically)
  - 07 compression work (the emissive PNGs remain the only zlib-compressed artefacts the arch probe measures)
  - CI (the arm64 runner is where the recorded Result line is settled)

actuals:
  # chars/4 over the 16,986 added bytes in this plan's diff.
  tokens: 4246
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - A determinism ban list is only credible with a seeded negative proof, so the zone ships with one that also proves the safe surface still passes
    - A cross-architecture claim is measured by rebuilding in isolated trees under two platforms, never inferred from a single-arch green
    - An environment that cannot run a comparison exits with a distinct non-zero code and names the missing capability, so a gap can never read as a pass

key-files:
  created:
    - tests/guards/tools-determinism.test.ts
    - scripts/check-arch-determinism.sh
  modified:
    - eslint.config.js

key-decisions:
  - "The determinism zone is scoped to `tools/oolite-ingest/**` only; `src/sim` and `src/render` keep their existing rules because render legitimately uses the banned trigonometry."
  - "`Math.sqrt`, `min`, `max`, `abs`, `floor`, `round`, `ceil`, `imul` and `fround` are deliberately unrestricted and proven to pass, so the rule cannot be mistaken for a blanket Math ban."
  - "The arch script builds the `deps` stage rather than `ci`, which avoids installing Chromium under QEMU and leaves the Dockerfile's five-FROM contract untouched."
  - "Exit 2 means 'the environment cannot run the comparison' and exit 1 means 'the bytes differ'; the two are never conflated, and there is no force/skip escape or environment variable."
  - "The Result line records the honest local outcome: arm64 execution is unavailable on this host, so the measurement is outstanding on the CI arm64 runner rather than assumed."

patterns-established:
  - "Seeded negative proof: write a probe in the protected zone, run the real gate, assert the rule id and reason, remove in `finally`."
  - "Capability gate: a comparison script distinguishes an unrunnable environment (exit 2, named capability) from a real failure (exit 1)."
  - "Empty documented exclusion list: the only place an exception may be written is the script header, so it appears in review."

requirements-completed: [DATA-08]

coverage:
  - id: D1
    description: "`tools/oolite-ingest/**` has an ESLint zone that fails on Math.sin/cos/tan/exp/log/pow/random, Date/Date.now, Intl, localeCompare, toFixed/toPrecision, eval and new Function, while Math.sqrt/min/max/abs/floor/round/ceil/imul/fround stay allowed; five seeded probes prove the rules fire and do not over-reach."
    requirement: DATA-08
    verification:
      - kind: unit
        ref: "tests/guards/tools-determinism.test.ts (5 tests: Math.sin, toFixed, new Date, Intl.NumberFormat fail; safe Math surface passes)"
        status: pass
      - kind: other
        ref: "docker compose run --rm lint (exit 0 on the real tree; no probe left behind)"
        status: pass
    human_judgment: false
  - id: D2
    description: "`scripts/check-arch-determinism.sh` parses, carries the SPDX header, the claim statement, an empty EXCLUSIONS section and a trap, builds the `deps` stage for linux/arm64 and linux/amd64, regenerates in isolated trees, compares file set/bytes/SHA-256/manifests, exits 1 on a diff and 2 on an unrunnable environment, and offers no override."
    requirement: DATA-08
    verification:
      - kind: other
        ref: "sh -n scripts/check-arch-determinism.sh (exit 0)"
        status: pass
      - kind: other
        ref: "sh scripts/check-arch-determinism.sh (exit 2: 'linux/arm64 execution is unavailable, no QEMU binfmt')"
        status: pass
      - kind: other
        ref: "docker compose run --rm lint and docker compose run --rm verify (both exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The arm64 and amd64 generated trees are proven byte-identical, with the file count recorded in the script's Result line."
    requirement: DATA-08
    verification: []
    human_judgment: true
    rationale: "This host has no linux/arm64 execution (no QEMU binfmt), so the two-platform comparison cannot run here; the script exits 2 and the Result line records the outstanding measurement plus the exact CI invocation. Only an arm64 runner can settle the claim."

duration: 4 min
completed: 2026-11-03
status: complete

plan_head_before: 41afd62c5b7b219355421be40af13037cd6e1bc1
plan_head_after: 28ecc2d16806665344aebe44405f7dfe5440c792
commits: 3
---

# Phase 2 Plan 08: Determinism Guards Summary

**The generator's lint zone now fails on every API the spec permits to differ across engines and architectures, proven by five seeded probes, and a two-platform Docker script proves — or refuses to claim — arm64/amd64 byte identity, recording that the measurement is still outstanding on this host.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-03T12:35:50Z
- **Completed:** 2026-11-03T12:40:09Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **The hole is closed statically, not by convention.** `eslint.config.js` gains a `tools/oolite-ingest/**/*.ts` zone whose every rule is `error`: `no-restricted-properties` for `Math.sin/cos/tan/exp/log/pow/random` and `Date.now`, `no-restricted-globals` for `Intl`, `no-restricted-syntax` for `new Date()`, `localeCompare`, `toFixed` and `toPrecision`, and explicit `no-eval`/`no-new-func`. Each message names the determinism reason and the safe replacement, so a failure is actionable without opening the config.
- **The safe surface is deliberately intact.** `Math.sqrt`, `min`, `max`, `abs`, `floor`, `round`, `ceil`, `imul` and `fround` are not restricted, and one probe asserts a file using all of them still lints clean. `src/sim` and `src/render` are untouched, so the render path keeps its legitimate trigonometry.
- **A rule was added to the tree without a single source change.** Every existing ingest file already avoided the banned APIs, so `lint` stayed green on the real tree; the zone is enforcement of a discipline the pipeline had been following by hand.
- **The negative proof is executable.** `tests/guards/tools-determinism.test.ts` writes `__purity_` probes into `tools/oolite-ingest/` at test time, runs the real ESLint gate, asserts the rule id and the reason text, and removes each probe in `finally`. After the suite, `git status --porcelain tools/oolite-ingest` is empty.
- **The cross-architecture claim has exactly one authority.** `scripts/check-arch-determinism.sh` reads the pinned Node base from the Dockerfile, probes both platforms, builds the `deps` stage for `linux/arm64` and `linux/amd64` from the same context, regenerates the content in isolated trees, and compares the file set, per-file bytes, per-file SHA-256 and both manifests. A diff exits 1 with `DIFF <path> (<class>)`; an environment gap exits 2 naming the capability. There is no force flag, allow-list flag, environment variable or per-file skip, and the `EXCLUSIONS` section contains only `# (none)`.
- **The result is recorded honestly.** This host cannot execute `linux/arm64` (`exec format error`, no QEMU binfmt), so the script exits 2 and the `Result:` line says the measurement is outstanding, naming the CI invocation that settles it.

## Task Commits

1. **Task 1: ban the nondeterministic APIs and prove the rule fires** — `defe20e` (feat)
2. **Task 2: write the cross-architecture determinism script** — `0f8cc55` (feat)
3. **Task 3: run the proof and record the result** — `28ecc2d` (docs)

**Plan metadata:** committed after this SUMMARY (docs).

## Files Created/Modified

- `eslint.config.js` — the `tools/oolite-ingest/**/*.ts` determinism zone plus `MATH_1ULP_MESSAGE`; the sim zone, the four-entry `ignores` list and `prettier`-last ordering are unchanged.
- `tests/guards/tools-determinism.test.ts` — five seeded cases: `Math.sin`, `toFixed`, `new Date()`, `Intl.NumberFormat` fail; the safe Math surface passes. Probes use the `__purity_` prefix so `tests/compliance.test.ts` skips them mid-run.
- `scripts/check-arch-determinism.sh` — executable, `#!/bin/sh`, SPDX header, capability preflight, two `deps` builds, two isolated regenerations, file-set/byte/SHA-256/manifest comparison, `trap` cleanup, empty `EXCLUSIONS`, recorded `Result:`.

## Decisions Made

- **Zone scope is `tools/oolite-ingest/**` only.** The bans are about emitted bytes, not simulation or rendering; extending them to `src/render` would break the camera code for no determinism gain (PATTERNS §Divergences 9).
- **No allow-list addition was needed.** The pipeline already used only `+ - * /`, `Math.sqrt`, integers, SHA-256 and `Math.fround`; `Math.hypot` appears only in a comment explaining why `Math.sqrt` was chosen.
- **`deps`, not `ci`, is built for both platforms.** Installing Chromium under QEMU would dominate the run time, and `deps` is the stage that carries the generator's dependencies.
- **Generation runs in a copy, not the working tree.** The inner command copies `package.json`, `tsconfig.json`, `tools`, `src` and `third_party` into `/out`, symlinks the image's `node_modules`, deletes any copied generated output and runs `tsx` there, so neither architecture can perturb the real tree.
- **Exit codes carry meaning.** 1 is a byte difference; 2 is an unrunnable environment. The record in the `Result:` line follows from that distinction.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The environment-failure message named Docker's help hint, not the capability**
- **Found during:** Task 3 (the first recorded run)
- **Issue:** The preflight used `tail -n 1` of the probe output, which is `Run 'docker run --help' for more information` — not a named missing capability, so the recorded reason would have been misleading.
- **Fix:** Added a `probe_reason` helper that prefers the line matching `exec format error` / `cannot overwrite digest` / `no matching manifest` / `permission denied` / `error during connect` and falls back to the last line. The run now reports `linux/arm64 execution is unavailable, no QEMU binfmt (docker: cannot overwrite digest …)`.
- **Files modified:** `scripts/check-arch-determinism.sh`
- **Verification:** `sh scripts/check-arch-determinism.sh` exits 2 with the named capability; `sh -n` and `lint` pass; the full `verify` chain stayed green.
- **Committed in:** `28ecc2d`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug).
**Impact on plan:** Diagnostic only; no behaviour change to the comparison, the exit codes or the exclusions.

## Issues Encountered

- **arm64 execution is genuinely unavailable here.** `docker run --platform linux/arm64 <pinned node> true` fails: with the digest reference Docker reports `cannot overwrite digest`, and with the tag it reaches the exec path and dies with `exec format error`; `/proc/sys/fs/binfmt_misc` has no registered `qemu-aarch64`. This is the plan's anticipated environment gap, handled as exit 2 plus an honest `Result:` line, not as a pass.
- **The pinned digest reference and `--platform` do not mix on this Docker build.** The amd64 probe succeeds; the arm64 probe fails at reference resolution before execution. The script treats any non-zero probe as "cannot run", so the distinction does not affect correctness, and the message names the Docker error verbatim.
- **No code changes were needed in the ingest pipeline.** The zone passed on the first run over the real tree, confirming prior plans' hand-discipline.

## User Setup Required

None — no external service configuration. Settling the outstanding measurement requires an arm64-capable runner (CI or a host with `binfmt` arm64 registered) and one command: `sh scripts/check-arch-determinism.sh`.

## Next Phase Readiness

- DATA-08's static half is complete and mechanically enforced: any new emitter under `tools/oolite-ingest/` inherits the bans without further wiring.
- The dynamic half has a single authority and a recorded, honest status. `/gsd-verify-work` should treat D3 as human-judgement coverage until the CI arm64 runner records a file count in the `Result:` line.
- The check is deliberately outside `verify`: `docker compose run` cannot choose a platform per invocation, so folding it in would either recurse or silently check only the host architecture.
- The Dockerfile still has exactly five `FROM` lines and `compose.yaml` is untouched.
- `verify` is green: lint, typecheck, `assets:check` (no differences), 174 unit tests (169 prior + 5 new), build, 3 Playwright tests.

---

*Phase: 02-data-pipeline-content-compiler*
*Completed: 2026-11-03*

## Self-Check: PASSED

- [x] All 3 tasks executed and committed (`defe20e`, `0f8cc55`, `28ecc2d`).
- [x] The tools zone names every banned API at `error` and restricts `Intl` via `no-restricted-globals`; `no-eval` and `no-new-func` are enabled.
- [x] Five probes pass: Math.sin, toFixed, new Date and Intl.NumberFormat fail; the safe Math surface (sqrt/min/max/abs/floor/round/ceil/imul/fround) passes.
- [x] `git status --porcelain tools/oolite-ingest` is empty after the suite.
- [x] `sh -n scripts/check-arch-determinism.sh` passes; SPDX, `trap`, `platform linux/arm64` and `platform linux/amd64` are present; `EXCLUSIONS` has only `# (none)`; no force/skip flag exists.
- [x] `sh scripts/check-arch-determinism.sh` exits 2 with `linux/arm64 execution is unavailable, no QEMU binfmt`; the `Result:` line records the outstanding CI measurement.
- [x] Two consecutive `docker compose run --rm assets` produced byte-identical trees (37 files).
- [x] `docker compose run --rm verify` exits 0 (174 unit tests, 3 Playwright tests, assets:check no differences).
- [x] The Dockerfile still has exactly five `FROM` lines and `compose.yaml` is unchanged.
