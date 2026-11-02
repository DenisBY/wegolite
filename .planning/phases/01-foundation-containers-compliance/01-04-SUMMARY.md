---
phase: 01-foundation-containers-compliance
plan: 04
subsystem: render
tags:
  [
    precision,
    camera-relative,
    float32-ulp,
    webgl2,
    logarithmic-depth,
    vitest,
    playwright,
  ]

# Dependency graph
requires:
  - "01-01: src/render/camera-relative.ts (cameraRelative/f32Ulp/f32Error), the precision scene, the __wegolite probe and tests/e2e/precision.spec.ts"
  - "01-02: the named `unit` Vitest project whose include glob is src/**/*.test.ts, plus the lint/typecheck gates"
  - "01-03: the pure sim core on the tree so the whole-tree test/build/e2e chain is meaningful"
provides:
  - "src/render/camera-relative.test.ts: three numeric proofs — exact 100 m float64 separation at 1e6 m, f32Ulp(1.4e6) === 0.125, and the half-ULP rounding bound at 1e6 + 0.1"
  - "Collection proof: the default `vitest run` glob names src/render/camera-relative.test.ts (3 tests), not just the sim tests"
  - "Re-verified browser half of FOUND-08: the built shell reports WebGL2, draw calls, log depth, 24 depth bits, both camera-relative placements, farUlp 0.125, the footer disclaimer, and an empty console/page-error array"
affects: [03-flight-model, 04-world-rendering, 07-quality]

# Actuals (#2632) — chars/4 over the realized diff (1,832 chars, one created file)
actuals:
  tokens: 458
  tasks: 2
  commits: 1
  plan_head_before: 6248f7e069b3ffcabef794e6505c5e52618b0811
  plan_head_after: 777639fb55f4fa55e13387c03ef89af4702ba0d6

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Precision proof by exact value: `toBe(100)` on the float64 separation and `toBe(0.125)` on the ULP — a tolerance would hide the very loss the test rules out"
    - "Half-ULP rounding bound measured at 1e6 + 0.1, a magnitude float32 cannot represent, so a transform that called Math.fround fails the strict `> 0` half"
    - "The probe is the only browser test surface: the spec reads window.__wegolite, never the canvas, and asserts no pixels"

key-files:
  created:
    - src/render/camera-relative.test.ts
  modified: []

key-decisions:
  - "The render test lives in src/render/ and imports './camera-relative.js', so the sim zone rule stays clean and the unit glob still collects it."
  - "No implementation commit was needed: src/render/camera-relative.ts shipped in 01-01, so task 1 is a test-only commit and the TDD detector correctly reports INVALID_RED (unexpected_green) — recorded, not papered over."
  - "Task 2 required no source change: 01-01 had already published every probe field and every hardened assertion the plan lists, so task 2 is a verification-only pass over the unchanged spec and probe."

requirements-completed: [FOUND-08]

coverage:
  - id: D1
    description: "Camera-relative subtraction happens in float64: two points 100 m apart at 1e6 + 0.1 m keep exactly 100 m of separation, asserted with toBe"
    requirement: FOUND-08
    verification:
      - kind: unit
        ref: "src/render/camera-relative.test.ts#keeps a 100 m separation exact at 1e6 m by subtracting in float64"
        status: pass
    human_judgment: false
  - id: D2
    description: "The float32 ULP at the 1.4e6 m worst case is exactly 0.125 m"
    requirement: FOUND-08
    verification:
      - kind: unit
        ref: "src/render/camera-relative.test.ts#pins the float32 ULP at the 1.4e6 m worst case to exactly 0.125"
        status: pass
    human_judgment: false
  - id: D3
    description: "float64 -> float32 rounding error at 1e6 + 0.1 is > 0 and <= half a ULP (0.03125), proving the transform does not apply Math.fround"
    requirement: FOUND-08
    verification:
      - kind: unit
        ref: "src/render/camera-relative.test.ts#bounds float64 to float32 rounding error by half a ULP at 1e6 + 0.1"
        status: pass
    human_judgment: false
  - id: D4
    description: "The render test is collected by the default unit project, not silently skipped by a sim-only include glob"
    requirement: FOUND-08
    verification:
      - kind: unit
        ref: "docker compose run --rm test -> 'src/render/camera-relative.test.ts (3 tests)', 4 files / 9 tests total"
        status: pass
    human_judgment: false
  - id: D5
    description: "Built shell in headless Chromium reports WebGL2, draw calls, triangles, log depth, depth bits, near/far camera-relative placements, farUlp 0.125 and the visible disclaimer, with zero console and page errors"
    requirement: FOUND-08
    verification:
      - kind: e2e
        ref: "tests/e2e/precision.spec.ts#shell boots, renders the precision scene, and reports no console errors (1 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "No pixel-based assertion exists anywhere in the test surface (no readPixels, no toHaveScreenshot, no snapshot)"
    requirement: FOUND-08
    verification:
      - kind: static
        ref: "grep -rn 'readPixels|toHaveScreenshot|toMatchSnapshot' tests/ src/ playwright.config.ts (no matches)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Full chain green: lint -> typecheck -> test -> build -> e2e"
    requirement: FOUND-08
    verification:
      - kind: integration
        ref: "docker compose run --rm verify (exit 0)"
        status: pass
    human_judgment: false

# Metrics
duration: 5min
completed: 2026-11-02
status: complete
---

# Phase 01 Plan 04: Precision Proof Summary

**FOUND-08 closed on both halves: a Node test pins the exact 100 m float64 separation at 1e6 m and the 0.125 m float32 ULP at 1.4e6 m, and the unchanged Playwright smoke proves the built shell renders the precision scene with log depth and zero console errors — with no pixel assertion anywhere.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-11-02T18:13:00Z
- **Completed:** 2026-11-02T18:18:00Z
- **Tasks:** 2 (1 test-only TDD task, 1 verification-only task)
- **Files modified:** 1 (created)

## Accomplishments

- `docker compose run --rm test npx vitest run src/render/camera-relative.test.ts --reporter=verbose` reports **3 passing tests**: the exact 100 m separation at `1e6 + 0.1` (with `toBe`, not `toBeCloseTo`), `f32Ulp(1.4e6) === 0.125`, and `0 < f32Error(1e6 + 0.1) <= f32Ulp(1e6 + 0.1) / 2` (measured error `0.025000000023283064` against the bound `0.03125`).
- The whole unit project reports **4 files / 9 tests** and names `src/render/camera-relative.test.ts (3 tests)`, proving the `src/**/*.test.ts` glob collects it — the exact failure mode the reference scaffold's `src/sim/**` glob had.
- `docker compose run --rm e2e` builds and reports **1 passed** for the single browser smoke, which asserts, in order: `webgl2 === true`, `calls > 0`, `triangles > 0`, `logDepth === true`, `depthBits >= 16` (SwiftShader reports 24), `nearRelZ ≈ -1e5`, `farRelZ ≈ -1.4e6`, `farUlp ≈ 0.125`, both required footer phrases via whitespace-normalising `toContainText`, and an empty console/page-error array last.
- `docker compose run --rm verify` — lint → typecheck → test → build → e2e — exits **0** end to end; this is the first wave where the full chain was expected green and it is.
- No pixel-based assertion exists: `grep -rn 'readPixels|toHaveScreenshot|toMatchSnapshot' tests/ src/ playwright.config.ts` matches nothing (D-08).

## Task Commits

Each task's outcome is committed atomically:

1. **Task 1 (TDD): Pin the float64 subtraction and the 1.4e6 m float32 ULP**
   - `777639f` (test) — `src/render/camera-relative.test.ts`, 3 numeric proofs. No `feat` commit was warranted; see TDD Gate Compliance below.
2. **Task 2: Harden the browser smoke** — verification-only, **no files changed** (see Deviations), so there is no task commit to make.

**Plan metadata:** this SUMMARY commit (docs) — the only remaining commit of the plan.

## Files Created/Modified

- `src/render/camera-relative.test.ts` — three cases, each with a comment naming the number it pins: exact 100 m float64 separation at 1e6 m, `f32Ulp(1.4e6) === 0.125`, and the half-ULP rounding bound measured at `1e6 + 0.1`. Imports `./camera-relative.js` (relative specifier), carries the S-6 SPDX header above the imports.

## Decisions Made

- **Test placement.** `src/render/camera-relative.test.ts` imports `./camera-relative.js`. A copy under `src/sim/` would be correctly rejected by the zone rule; the `unit` project already globs `src/**/*.test.ts`, so no config change was needed.
- **Exact assertions where exactness is claimed.** `toBe(100)` and `toBe(0.125)`, with a tolerance only where the plan asks for a bound (`f32Error(x) <= f32Ulp(x) / 2`). Relaxing either to `toBeCloseTo` would let a float32 round-trip hide.
- **`1e6 + 0.1`, not `1.4e6`, for the rounding case.** `Math.fround(1.4e6)` is exact, so the strict `> 0` half would be unsatisfiable at that magnitude; the `1.4e6` magnitude is carried by the exact ULP proof instead.

## Deviations from Plan

### Auto-fixed Issues

None — no bug, missing critical functionality or blocker was found in either task.

### Verified-as-already-complete (task 2)

**Task 2 had no work left to do, and this was verified rather than assumed.**

- **Found during:** Task 2, before any edit.
- **Issue:** The plan's task 2 asks to extend `window.__wegolite` with `calls`, `triangles`, `logDepth`, `depthBits`, `webgl2`, `nearRelZ`, `farRelZ` and `farUlp`, and to assert, in order, those values plus the two footer phrases and the empty console-error array. Plan 01-01 (a declared `depends_on` of this plan) had already shipped exactly those probe fields (`src/main.ts:151-161`) and a `tests/e2e/precision.spec.ts` that already matched the required assertion order, the whitespace-normalising footer check, the pre-`goto` listeners, the 20 s `ready` wait and the console-error-last ordering.
- **Action:** Audited field-by-field against the plan's task-2 action, then ran the task's own gates on the unchanged tree: `docker compose run --rm e2e` → `1 passed`; `grep` for pixel assertions → no matches; `docker compose run --rm verify` → exit 0.
- **Files modified:** none.
- **Commit:** none — a no-op task cannot be committed, and an empty commit would add history noise. The evidence is in this SUMMARY and in the verification output above.

- **Impact on plan:** FOUND-08's browser half is proven by the existing spec; no assertion was weakened (constraint 8). The only file this plan changed is the new unit test, which is why `actuals.tokens` is far below the plan's 36k estimate: the estimate priced a rewrite that was not needed.

---

**Total deviations:** 0 auto-fixed; 1 task verified as already complete.
**Impact on plan:** No scope change, no assertion weakened, no dependency touched.

## Prohibition Review (plan `prohibitions`, flagged for human judgment)

The plan forbids replacing the precision proof with screenshot or pixel-diff assertions; stability at 1.4e6 m must be asserted as numeric facts. Compliance, by inspection:

- The only new assertions are numeric (`toBe(100)`, `toBe(0.125)`, a half-ULP bound). No image, baseline or colour sample was added.
- `grep -rn 'readPixels|toHaveScreenshot|toMatchSnapshot' tests/ src/ playwright.config.ts` returns nothing; `playwright.config.ts` keeps `trace: "off"` and `screenshot: "off"`, and the viewport stays 1280×720 so the "one pixel ≈ 2,245 m at 1.4e6 m" comment remains true.
- The far marker's evidence remains its placement (`farRelZ`) and the ULP, never its visibility — consistent with the plan's flagged assumption that it is deliberately sub-pixel.

## TDD Gate Compliance

| Gate     | Commit    | Evidence                                                                                                        |
| -------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| RED      | `777639f` | `test(01-04): ...` — the target test was run first, **before** any edit, and passed 3/3                  |
| GREEN    | —         | Not applicable: no production edit was required or made                                                        |
| REFACTOR | —         | Not applicable                                                                                                  |

**Honest RED assessment — machine verdict `INVALID_RED (reason: unexpected_green)`.** The evidence record (`.gsd/red-evidence-01-04.json`, gitignored) was produced by the real command and classified as:

```
passed: false, block: true, verdict: "INVALID_RED", reason: "unexpected_green"
evidence: { tests: 3, pass: 3, fail: 0, format: "tap" }
```

The cause is structural, not a mistake in the test: `src/render/camera-relative.ts` — the module under test — was delivered by plan 01-01, which this plan lists in `depends_on`. The behaviour existed before the test could be written, so no honest RED was available without deleting verified shipped code to manufacture a failure; that was rejected as dishonest. Following `tdd.md` step 5 ("If test passes: feature exists or test is wrong"), the investigation confirmed the feature exists and the test asserts exactly the planned behaviour. There is no GREEN commit because there was nothing to implement. This is surfaced rather than papered over so the phase verifier can rule on it.

## Known Stubs

None. The test file contains no placeholder, no skipped case, and no hardcoded empty value.

## Threat Flags

None — this plan adds no endpoint, auth path, file-access boundary or schema change, and no dependency (`T-01-SC` holds: the test uses only built-in `Math`). `T-01-10` (readable WebGL2 failure, no silent blank canvas) and `T-01-11` (`textContent`-only overlay writes) remain implemented in `src/main.ts` and are exercised by the passing browser smoke.

## Issues Encountered

- None. Every command in the plan's `<verify>` blocks was run verbatim and exited 0; the plan's `docker compose run --rm test npx vitest run …` form works because the service command is `npm test` and npm forwards the extra arguments to the `vitest run` script (verified, 3 passed).
- Vite's pre-existing 533 kB chunk warning remains, as recorded by plans 01-01 and 01-03. Non-fatal and out of scope for this plan.

## Next Phase Readiness

- FOUND-08 is closed with both halves green and no pixel assertions anywhere.
- Phase 3 can judge camera-relative stability against a real planet and station; the numeric proof it inherits is `f32Ulp(1.4e6) === 0.125` and the exact float64 separation case.
- The manual-only item from `01-VALIDATION.md` row 3 (perceptual stability on a discrete GPU) is untouched by design: SwiftShader proves the numbers, not the perception.

---

*Phase: 01-foundation-containers-compliance*
*Completed: 2026-11-02*

## Self-Check: PASSED

- `src/render/camera-relative.test.ts` exists and starts with the S-6 SPDX header above its imports.
- `777639f` is an ancestor of HEAD.
- `docker compose run --rm test` names `src/render/camera-relative.test.ts (3 tests)` among 4 files / 9 tests.
- `docker compose run --rm e2e` → 1 passed; `docker compose run --rm verify` → exit 0.
- `grep -rn 'readPixels|toHaveScreenshot|toMatchSnapshot' tests/ src/ playwright.config.ts` → no matches.
