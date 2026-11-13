---
phase: 01-foundation-containers-compliance
plan: 06
subsystem: infra
tags: [docker, compose, smoke-test, fail-fast, cold-state, playwright, chromium, curl, posix-shell]

# Dependency graph
requires:
  - "01-01: the seven-service Compose topology, ports 5173/4173 and the `sh -lc` verify chain rehearsed here"
  - "01-02: the sim-zone ESLint rule (`no-restricted-imports` on `three`) the fail-fast seed trips"
  - "01-03: the sim core and Vitest project the verify chain runs"
  - "01-04: the precision shell and Playwright spec at the end of the chain"
  - "01-05: the README/AGENTS command contract these scripts execute verbatim"
provides:
  - "scripts/smoke-dev.sh: FOUND-01 machine check (5173 serves the Vite HMR client)"
  - "scripts/smoke-preview.sh: FOUND-02 machine check (4173 serves the built bundle)"
  - "scripts/check-verify-fails-fast.sh: FOUND-03 negative proof (non-zero at lint, seed cleaned up)"
  - "Recorded cold-state evidence: volume-free `docker compose build` + `verify` exits 0 through lint, typecheck, test, build, e2e"
  - "Recorded offline evidence: chromium resolves under /ms-playwright with `--network none`"
affects: [07-quality, phase-verification, ci-wiring]

# Actuals (#2632) — chars/4 over the realised diff (6,012 chars)
actuals:
  tokens: 1503
  tasks: 2
  commits: 2
  plan_head_before: bc6404383326ca78cb57fb346d5c9a4318b7bcee
  plan_head_after: b54cdf4b58cb7fc20bacba2c1f8616feb2c98dc6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reachability smoke scripts assert an HTTP body marker, never a listening port, and tear down via `trap ... EXIT` so a red run cannot leave a stale service behind"
    - "A fail-fast rehearsal registers its cleanup trap BEFORE writing the seed, and requires both a non-zero exit and output naming the seed or the rule, so an unrelated failure cannot satisfy it"
    - "`curl --retry-all-errors` alongside `--retry-connrefused`: Docker's port proxy accepts the TCP connection before the app listens, so the first attempt is reset (exit 56), not refused"

key-files:
  created:
    - scripts/smoke-dev.sh
    - scripts/smoke-preview.sh
    - scripts/check-verify-fails-fast.sh
  modified: []

key-decisions:
  - "Both smoke scripts `cd \"$(dirname \"$0\")/..\"` first, so `sh scripts/<name>.sh` works from any working directory while the Compose project still resolves to the repository root."
  - "The smoke scripts poll with `curl --retry-all-errors`, not a bounded `sleep` loop or a bare port probe: the assertion is the served body, and every retry re-runs the same real HTTP request."
  - "The fail-fast seed is the sim-zone `three` import, not an unused local: `@typescript-eslint/no-unused-vars` exempts exported declarations, so an unused export is not a guaranteed error-severity failure."
  - "The fail-fast script is deliberately excluded from `verify` (it would recurse); the plan-level gate invokes it as a rehearsal tool."

patterns-established:
  - "Smoke: `docker compose up -d <svc>` + `trap 'docker compose down' EXIT` + body grep; no Compose healthchecks, one authority per requirement (PATTERNS §7)"
  - "Negative rehearsal: seed under the bind mount, capture status with `set +e` around exactly one command, assert non-zero AND corroborating output, rely on the trap for cleanup"

requirements-completed: [FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-09]

coverage:
  - id: D1
    description: "`sh scripts/smoke-dev.sh` starts the `app` service, waits for an HTTP response whose body contains `@vite/client`, and leaves no container running"
    requirement: FOUND-01
    verification:
      - kind: integration
        ref: "sh scripts/smoke-dev.sh -> exit 0, 'dev smoke: 5173 served the HMR client', docker compose ps empty"
        status: pass
    human_judgment: false
  - id: D2
    description: "`sh scripts/smoke-preview.sh` starts the `preview` service, waits for the built bundle, and only passes when the served page contains `foundation build`"
    requirement: FOUND-02
    verification:
      - kind: integration
        ref: "sh scripts/smoke-preview.sh -> exit 0, 'preview smoke: 4173 served the production bundle', docker compose ps empty"
        status: pass
    human_judgment: false
  - id: D3
    description: "`sh scripts/check-verify-fails-fast.sh` proves a seeded lint error stops `verify` at the lint stage with a non-zero exit and cleans the seed up"
    requirement: FOUND-03
    verification:
      - kind: integration
        ref: "sh scripts/check-verify-fails-fast.sh -> exit 0, output names src/sim/__verify_probe.ts and no-restricted-imports, probe absent afterwards"
        status: pass
    human_judgment: false
  - id: D4
    description: "From a volume-free state the named `node_modules` volume repopulates from the image and `docker compose run --rm verify` exits 0 through lint, typecheck, test, build and e2e"
    requirement: FOUND-03
    verification:
      - kind: integration
        ref: "docker compose down --volumes --remove-orphans && docker compose build && docker compose run --rm verify -> exit 0 (19 unit tests, 1 e2e test)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Chromium is baked into the image and resolves with no network access"
    requirement: FOUND-04
    verification:
      - kind: integration
        ref: "docker run --rm --network none wegolite-ci sh -lc 'ls /ms-playwright | grep -qi chromium' -> exit 0 (chromium-1248, chromium_headless_shell-1248, ffmpeg-1013)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every command in the README/AGENTS table has been executed verbatim and behaves as documented"
    requirement: FOUND-09
    verification:
      - kind: integration
        ref: "smoke-dev.sh (docker compose up app), smoke-preview.sh (up preview), verify / test / lint / typecheck / e2e via the cold-state and fail-fast runs"
        status: pass
    human_judgment: false
  - id: D7
    description: "Hot reload fires on a host edit (not just that the HMR client is served)"
    requirement: FOUND-01
    verification: []
    human_judgment: true
    rationale: "File-event propagation into a bind mount is host-specific (macOS/WSL2) and cannot be observed from inside this Linux container. 01-VALIDATION.md Manual-Only row 1; `VITE_USE_POLLING=1` is the documented escape hatch."

# Metrics
duration: 2min
completed: 2026-11-02
status: complete
---

# Phase 01 Plan 06: Foundation, Containers & Compliance Summary

**Two body-asserting smoke scripts for ports 5173/4173 and a fail-fast rehearsal that proves `verify` goes non-zero at the lint stage, plus the cold-state gate: volume-free rebuild, full `verify` green (lint → typecheck → 19 unit tests → build → 1 e2e), and Chromium resolving under `/ms-playwright` with `--network none`.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-11-02T18:30:32Z
- **Completed:** 2026-11-02T18:32:29Z
- **Tasks:** 2
- **Files modified:** 3 (3 created, 0 modified)

## Accomplishments

- `scripts/smoke-dev.sh` starts `app` detached, polls `http://localhost:5173/` and exits 0 only when the *body* contains `@vite/client`; `scripts/smoke-preview.sh` does the same for `preview` on 4173 and `foundation build`. Both tear down via `trap 'docker compose down' EXIT`, so a failed assertion cannot leave a stale server behind (T-01-19), and both ended with `docker compose ps` empty.
- `scripts/check-verify-fails-fast.sh` seeds `src/sim/__verify_probe.ts` with a `three` import, runs `docker compose run --rm verify`, and passes only on a non-zero exit whose output names the probe or `no-restricted-imports`. Observed: verify stopped inside `npm run lint` after 4.7 s with `'three' import is restricted from being used by a pattern. src/sim must stay renderer-free`, and the trap removed the seed.
- Cold-state gate: `docker compose down --volumes --remove-orphans` removed the only volume, `docker compose build` republished `wegolite-ci`, and `docker compose run --rm verify` then exited 0 in 20.7 s — lint, typecheck, 5 test files / 19 tests, a 408 ms `vite build`, and the Playwright precision spec (1 passed). This is the run that proves the named `node_modules` volume repopulates from the image rather than from a stale copy (Pitfall 2, T-01-18).
- `docker run --rm --network none wegolite-ci sh -lc 'ls /ms-playwright | grep -qi chromium'` exits 0 with `chromium-1248`, `chromium_headless_shell-1248` and `ffmpeg-1013` present, so no browser download can be hiding in the test path (FOUND-04, T-01-SC).
- All three scripts carry the S-6 SPDX header in the first three lines (shell-comment form), are committed mode `100755`, and pass the tree-wide compliance walk and `prettier --check .` without any `.prettierignore`/`.eslintignore` change.

## Task Commits

Each task was committed atomically:

1. **Task 1: Script the dev and preview reachability checks** - `57f7ccb` (feat)
2. **Task 2: Prove the verify chain fails fast and run the clean-state phase gate** - `b54cdf4` (feat)

**Plan metadata:** this SUMMARY commit (docs).

## Files Created/Modified

- `scripts/smoke-dev.sh` — FOUND-01 authority: `up -d app`, body assertion for `@vite/client`, trap teardown
- `scripts/smoke-preview.sh` — FOUND-02 authority: `up -d preview` (which builds first), body assertion for `foundation build`, trap teardown
- `scripts/check-verify-fails-fast.sh` — FOUND-03 negative proof: seed the sim-zone `three` import, require a non-zero verify whose output names the probe or the rule, trap cleanup registered before the seed

## Decisions Made

- The smoke scripts `cd "$(dirname "$0")/.."` before touching Compose, so `sh scripts/<name>.sh` behaves identically from the repository root or anywhere else while still resolving the project directory.
- Polling is `curl --retry`, not a framing loop with `sleep`: every retry is the real HTTP request being asserted, so success can only mean a body was actually served.
- The fail-fast seed is a `three` import rather than an unused local declaration: `@typescript-eslint/no-unused-vars` exempts exported declarations, so there is no other guaranteed error-severity rule to trip.
- No Compose `healthcheck` entries were added for `app`/`preview`: the scripts are the single authority for FOUND-01/02 (PATTERNS §7).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `curl --retry-connrefused` never retried the first attempt, because Docker's port proxy resets it instead of refusing it**
- **Found during:** Task 1 (first run of `scripts/smoke-dev.sh`)
- **Issue:** The first invocation printed `curl: (56) Recv failure: Connection reset by peer` and exited 56 after 0.6 s. Docker publishes ports through a proxy that accepts the TCP connection immediately, before Vite is listening; the container then resets it. `--retry-connrefused` only retries `ECONNREFUSED`, and plain `--retry` does not retry exit 56, so the poll mechanism the plan specified could not wait for the server at all.
- **Fix:** added `--retry-all-errors` alongside the planned `--retry 30 --retry-delay 1 --retry-connrefused` in both scripts, with a comment explaining why the reset case needs it. The assertion is unchanged — the retried entity is still the real HTTP request, and a body without the marker still fails.
- **Files modified:** `scripts/smoke-dev.sh`, `scripts/smoke-preview.sh`
- **Verification:** both scripts then exit 0 from a stopped stack (`dev smoke: 5173 served the HMR client`, `preview smoke: 4173 served the production bundle`) and `docker compose ps` is empty afterwards.
- **Committed in:** `57f7ccb` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** No scope change and no weakened assertion. The plan's retry flags were necessary but not sufficient for Docker's published-port behaviour; the added flag only widens *which transport errors* are retried, never which bodies are accepted.

## Prohibition Review (plan `prohibitions`, flagged for human judgment)

The plan forbids manufacturing a green `verify`. Checked:

- **No stage skipped.** The chain is the committed `sh -lc` with `&&`; the cold run visibly executed `lint`, `typecheck`, `test` (5 files / 19 tests), `build` and `test:e2e` (1 passed).
- **No tolerated exit code.** Neither script contains `|| true`, `;`-chaining or `set +e` beyond the single `docker compose run` whose status is captured and asserted non-zero.
- **No hidden failure behind fan-in.** `verify` has no `depends_on`; the fail-fast run stopped inside the first stage (lint), which is only observable because the chain short-circuits.
- **The negative proof cannot be satisfied accidentally.** It requires both a non-zero exit *and* output naming the probe file or `no-restricted-imports`, so a missing image or network fault fails the rehearsal instead of passing it.
- **The cold run is genuinely cold for the property under test.** The named volume was removed and recreated; the image build itself was a layer-cache hit (2.2 s) because no image input changed, which does not affect volume repopulation — it is the volume, not the layer cache, that Pitfall 2 is about.

## Issues Encountered

- The successful smoke runs print one `curl: (56)` line on stderr before the retry succeeds. It is the expected reset from Docker's port proxy, not a failure, and is explained in each script's comment; the scripts keep `curl -S` so a genuine (non-retrying) failure still shows curl's reason.
- `docker compose build` completed in 2.2 s from cache. Recorded honestly above: the *volume* was removed and repopulated, but no image layer was rebuilt. A `--no-cache` build remains the documented step for dependency changes (README), and the plan asked for `build`, not `build --no-cache`.
- `docker compose` prints duplicated `Network ... Creating` lines for these invocations. Cosmetic, from concurrent service resolution; it does not affect the result.

## Known Stubs

None.

## Threat Flags

None — no endpoint, auth path, file-access boundary or schema change. T-01-17 (non-fail-fast chain) is now positively rehearsed by `check-verify-fails-fast.sh`; T-01-18 (stale volume) by the `down --volumes` → `build` → `verify` run; T-01-19 (stale service after a failed smoke) by the `trap ... EXIT` teardown verified with `docker compose ps`; T-01-SC holds — no dependency was added or changed, and the browser check runs with `--network none`.

## Next Phase Readiness

- FOUND-01/02/03/04/09 now have machine evidence, not just a documented contract: a contributor can run three scripts and the cold gate and see exactly what `AGENTS.md` promises.
- The one open item inside these requirements is host-side HMR propagation (coverage `D7`, `01-VALIDATION.md` Manual-Only row 1) — it needs a human on macOS/WSL2, with `VITE_USE_POLLING=1` as the documented fallback.
- Phase 1's automated surface is complete: `docker compose run --rm verify` is green from a volume-free state, so `/gsd-verify-work` can run on a clean tree.
- Planning tracking (`STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`) is intentionally untouched: the orchestrator owns those writes after the wave completes.

---

*Phase: 01-foundation-containers-compliance*
*Completed: 2026-11-02*

## Self-Check: PASSED

- All three artefacts exist on disk and are executable: `scripts/smoke-dev.sh`, `scripts/smoke-preview.sh`, `scripts/check-verify-fails-fast.sh` (mode `100755` in `git ls-files -s`).
- Both task commits (`57f7ccb`, `b54cdf4`) are ancestors of `HEAD`.
- Re-ran all three scripts after the commits: each exits 0; `docker compose ps` empty afterwards; `src/sim/__verify_probe.ts` absent.
- `docker compose down --volumes --remove-orphans && docker compose build && docker compose run --rm verify` exits 0.
- `docker run --rm --network none wegolite-ci sh -lc 'ls /ms-playwright | grep -qi chromium'` exits 0.
