---
phase: quick-261110-l2x
plan: 261110-l2x
subsystem: tooling
tags: [performance, vitest, eslint, guard-tests, developer-loop]
status: complete
requirements: []
commits: 2
plan_head_before: a8214aabc16cc94fea0d39c93a3355ca60639978
deviations: 0
---

# Quick task 261110-l2x: speed up the unit-test loop

## What changed

- **Shared ESLint gate.** `tests/guards/eslint-gate.ts` holds one `ESLint`
  instance per Vitest worker and lints each transient probe with `lintText()`
  against its absolute path. It returns a `GateRun` with `status` (`1` when any
  result has `errorCount > 0`), a synthesised `output` of `ruleId + message`
  lines, and flat structured `messages` including `messageId`. The custom rule
  messages carry every string the guard assertions match (`Math.sin`,
  `toFixed`, `Date`, `Intl`, `renderer-free`, `content/types`,
  `patternWithCustomMessage`), so no assertion was weakened.
- **Async probe lock.** `tests/guards/probe-lock.ts` is now
  `async function withProbeLock<T>(body: () => Promise<T> | T): Promise<T>`
  with `return await body()` inside the `try`. The directory lock therefore
  stays held until the awaited lint settles. The stale-lock timeout, polling
  and `Atomics.wait` sleep are unchanged.
- **Three guard files migrated.** `tools-determinism.test.ts`,
  `content-boundary.test.ts` and `sim-purity.test.ts` call `lintProbe()`
  instead of spawning `npx eslint`; their local `runGate`/`--format json`
  parsing and result interfaces are gone. The 5 `tsc -p tsconfig.sim.json`
  spawns remain, and `runGate` is kept for them only. `economy-purity.test.ts`
  is a pure source scan and is untouched. All 28 guard tests, their timeouts
  and their cleanup behaviour survive.
- **Positive control hardened.** `the safe Math surface passes lint` now also
  asserts `expect(lint.messages).toEqual([])`, so a probe matching an ESLint
  ignore cannot make the test pass on an empty result. The full suite passed
  with this assertion, proving it is non-vacuous.
- **Coverage-free local script.** `package.json` gains
  `"test:fast": "vitest run"`. `npm test` stays `vitest run --coverage` with
  all D-19 per-glob thresholds, and neither `verify` nor `verify-full` changes.
  `AGENTS.md` and `README.md` gain a command-table row, `README.md` an
  operational note, `CHANGELOG.md` one `Added` and one `Changed` bullet, and
  `.planning/PROJECT.md` a Key Decisions row.

## Why the projection was revised

The pre-implementation projection was about 54 s saved on `npm test`. The
measured saving on the full suite is about 27 s. The reason is CPU contention:
under the 103-file parallel run, the three per-worker ESLint program builds
compete with `drift.test.ts`, `texture-encode.test.ts` and `dock-no-trap.test.ts`,
so the first guard case expands from about 5.3 s in isolation to 17–38 s. The
isolated guard-only improvement is 3.7×, but the whole-suite gain is diluted.
The optimistic projection also assumed four program builds; only three guard
files lint at all.

## Measured effect (Docker, sequential A/B pairs on one host)

| Run | Baseline | After | Delta |
|---|---|---|---|
| `npx vitest run tests/guards` | 62.2 s | 16.71 s (28 tests) | −45.5 s, 3.7× |
| `npm test` (`vitest run --coverage`) | 92.6 s | 65.91 s (also 64.89 s and 61.61 s on repeat runs) | ≈ −27 s, ~29 % |
| `npm run test:fast` (`vitest run`) | 78.7 s | 36.80 s | −41.9 s |
| Local loop (coverage gate to `test:fast`) | 92.6 s | 36.80 s | −55.8 s, ~2.5× |

Coverage itself costs about 13.8 s (≈15 %) on the 103-file suite. The browser
suite is untouched and still dominates the release gate at about 21.4 min on
SwiftShader.

## Verification (Docker only)

All commands were run strictly sequentially. `lint` must never run in
parallel with `test` in this repository: guard tests create transient
`__purity_*_probe.ts` files, and a concurrent `eslint .` can enumerate a file
that has already been deleted (`ENOENT ... __purity_math_probe.ts`).

| Command | Result |
|---|---|
| `docker compose run --rm typecheck` | passed (both `tsc` invocations); first run caught and fixed a `TS2322` for an optional `messageId` under `exactOptionalPropertyTypes` |
| `docker compose run --rm test` | 103 files, 1366 passed, 1 skipped (1367), 65.91 s; full D-19 coverage table printed, all thresholds satisfied |
| `docker compose run --rm test npm run test:fast` | 103 files, 1366 passed, 1 skipped, 36.80 s |
| `docker compose run --rm lint` | `eslint .` clean; `All matched files use Prettier code style!` |
| `docker compose run --rm verify` | full fast gate passed: lint, typecheck, `assets:check: no differences`, test (103 / 1366 / 1 skipped, 61.61 s), build (1.19 s), `test:e2e:fast` 19 passed (2.1m) |
| `npx vitest run tests/guards --reporter=verbose` | 4 files, 28 passed, 16.71 s |
| Spikes (scratch, `/tmp`, removed) | 17 transient probes, one `ESLint`: first 3.5 s, rest 60–117 ms, 4.7 s total; zone diagnostics returned exactly the expected rule ids and messages |

`verify` was run as a regression test of the whole fail-fast chain in one
container, not as a speed measurement; the A/B figures above come from the
dedicated `npm test` / `test:fast` pairs.

## Limitations

- The guard tests now prove the root config and the zone rules through the
  ESLint Node API, **not** that `npx eslint <probe>` works. The `lint` stage
  (`eslint .`) still exercises the CLI indirectly. `GateRun.output` is a
  synthesised `ruleId + message` string and carries no file path, line number,
  severity or summary block; a future assertion on those would need the type
  extended.
- ESLint CLI without `--max-warnings` also returns 0 for warnings-only and 1
  for errors, so `status` semantics are unchanged. The three cold program
  builds still contend with other unit files under the parallel run.
- The five `tsc` spawns (≈6 s) remain; recommendation 3 covered ESLint only.
- `npm run test:fast` drops coverage for the local loop only; it must not
  replace `npm test` in a gate.

## Review triage

An external review at `/tmp/opencode/perf-unit-test-loop-review.md` was checked
against the source. Accepted and applied: the vacuous positive-control risk
(Task 6), the need to stage the untracked `eslint-gate.ts` explicitly and to
avoid `git add -A` (which would sweep in pre-existing `.planning/`
diagnostics), and the documented loss of CLI coverage above. Rejected as
incorrect: that warnings change the exit-status semantics; that
`.planning/ui-reviews/.gitignore` is new and required (it is pre-existing and
already ignores the PNGs); that no timing baseline existed; and that the
project service speculatively holds probe files open (unique probe paths, a
serialising lock and the 17-probe spike all contradict it). The review's
"3 programs instead of ~17 spawns" is exact.

## Not run

`docker compose run --rm verify-full` and `docker compose run --rm e2e-cross`
were not run on this branch. The change touches neither the full Chromium
suite nor the Firefox project; those were exercised on the separate
`perf/e2e-seam-config-split` branch. The test-only hardening from Task 6
needs no CHANGELOG entry (internal-only per the contributor rules) and is
recorded here instead.

## Operational note

`npm run test:fast` is for the local loop; the definition of done stays
`docker compose run --rm verify`. Note that the WR-04 seam spec and
`test:e2e:seams` from quick task 261110-j89 live on the other branch and are
not part of this change.
