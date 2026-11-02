---
phase: 01-foundation-containers-compliance
plan: 02
subsystem: tooling
tags: [typescript, tsconfig, eslint, flat-config, import-zones, vitest, prettier, guard-test]

# Dependency graph
requires:
  - "01-01: the seven-service compose topology, the frozen package set and the container-only `test`/`lint`/`typecheck` entry points"
provides:
  - "tsconfig.json: strict base project (strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes + verbatimModuleSyntax) covering every linted file"
  - "tsconfig.sim.json: checking-only purity project (lib ES2022, types []) that fails a DOM identifier under src/sim/ with TS2584"
  - "eslint.config.js: flat config with the src/sim zone rules at error severity, prettier last"
  - "vitest.config.ts: one Node project named unit over src/**/*.test.ts + tests/**/*.test.ts"
  - "tests/guards/sim-purity.test.ts: two-case negative proof that both gates can fail"
affects: [02-content-compiler, 03-flight-model, 04-world-rendering, 05-station-screens, 06-navigation, 07-quality]

# Actuals (#2632) — chars/4 over the realized diff (15,493 chars)
actuals:
  tokens: 3873
  tasks: 3
  commits: 3
  plan_head_before: 673c2093622b9a2cba1830f27e38c395cdff45a0
  plan_head_after: 278b232

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-gate sim purity: tsconfig.sim.json owns DOM identifiers (TS2584), ESLint owns Three imports and non-deterministic APIs"
    - "Zone rules are always error severity; the ESLint ignore list is a fixed four-entry set with nothing under src/"
    - "ESLint projectService reads the root tsconfig.json; allowDefaultProject names only eslint.config.js (never double-listed)"
    - "Guard tests generate their probes under src/sim/ at test time and delete them in a finally block — no committed violations"
    - "tsconfig.sim.json is a checking-only project, not a composite reference: two independent tsc -p --noEmit runs"

key-files:
  created:
    - tsconfig.json
    - tsconfig.sim.json
    - eslint.config.js
    - vitest.config.ts
    - tests/guards/sim-purity.test.ts
  modified:
    - .prettierignore
    - playwright.config.ts
    - AGENTS.md
    - index.html
    - src/main.ts
    - tests/e2e/precision.spec.ts

key-decisions:
  - "tsconfig.sim.json also gates src/render/camera-relative.ts: it is DOM- and Three-free by design, so a future Three import inside it now fails typecheck, and the gate stays non-empty before src/sim/ exists."
  - "The .prettierignore addition is `.gsd` only — agent runtime state, never source. No src/ path was added, so the red-gate prohibition is intact."
  - "tests/guards/sim-purity.test.ts shells out to `npx eslint` / `npx tsc` rather than reimplementing the rules, so the assertions track the real gates (about 6.5 s for the two cases)."
  - "playwright.config.ts spreads devices['Desktop Chrome'] before its explicit keys; Desktop Chrome's viewport is already 1280x720, so this is a TS2783 fix with no behaviour change."

requirements-completed: [FOUND-05, FOUND-03]

coverage:
  - id: D1
    description: "Strict TypeScript across the whole tree, with the three extras enabled and both projects type-checking clean"
    requirement: FOUND-05
    verification:
      - kind: integration
        ref: "docker compose run --rm typecheck (tsc -p tsconfig.json --noEmit && tsc -p tsconfig.sim.json --noEmit)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A DOM identifier under src/sim/ fails the purity project with TS2584"
    requirement: FOUND-05
    verification:
      - kind: unit
        ref: "tests/guards/sim-purity.test.ts#sim purity gates > DOM identifier fails typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "A Three import under src/sim/ fails ESLint with no-restricted-imports / renderer-free"
    requirement: FOUND-05
    verification:
      - kind: unit
        ref: "tests/guards/sim-purity.test.ts#sim purity gates > Three import fails lint"
        status: pass
    human_judgment: false
  - id: D4
    description: "Clean-tree lint (eslint . && prettier --check .) exits 0 and no zone rule is a warning"
    requirement: FOUND-05
    verification:
      - kind: integration
        ref: "docker compose run --rm lint"
        status: pass
    human_judgment: false
  - id: D5
    description: "Vitest runs one Node project named unit reporting the two guard cases as passing"
    requirement: FOUND-05
    verification:
      - kind: unit
        ref: "docker compose run --rm test (2 passed, project 'unit')"
        status: pass
    human_judgment: false
  - id: D6
    description: "The verify chain's first three stages are green in the container, and the full chain still passes end to end"
    requirement: FOUND-03
    verification:
      - kind: integration
        ref: "docker compose run --rm verify (lint -> typecheck -> test -> build -> e2e, exit 0)"
        status: pass
    human_judgment: false

# Metrics
duration: 3min
completed: 2026-11-02
status: complete
---

# Phase 01 Plan 02: Foundation, Containers & Compliance Summary

**Two-gate sim purity made real: strict TS across the tree plus a DOM-free checking project (TS2584) and an ESLint flat config (Three imports, DOM globals, non-deterministic APIs at `error`), with a guard test that proves both gates can fail.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-11-02T18:06:43Z
- **Completed:** 2026-11-02T18:09:37Z
- **Tasks:** 3
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments

- `docker compose run --rm typecheck` exits 0 with both projects: the root project (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`, DOM lib) and the purity project (`lib: ["ES2022"]`, `types: []`).
- A seeded `document.createElement` under `src/sim/` fails the purity project with `TS2584: Cannot find name 'document'` — measured directly during Task 1 and permanently by the guard test.
- A seeded `import * as THREE from "three"` under `src/sim/` fails `docker compose run --rm lint` with `no-restricted-imports` and the message "src/sim must stay renderer-free" (exit 1) — measured directly during Task 2 and permanently by the guard test.
- `docker compose run --rm lint` exits 0 on the clean tree (`eslint . && prettier --check .`); every sim-zone rule is `"error"`, and the ignore list is a fixed four-entry set with nothing under `src/`.
- `docker compose run --rm test` reports one project named `unit` with both guard cases passing, and no probe file survives the run (`git status --porcelain` clean of `src/sim/__purity_*`).
- `docker compose run --rm verify` — the definition of done — now exits 0 end to end (lint → typecheck → test → build → e2e), so the first three stages this plan owns are joined by a working full chain.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the strict root TypeScript project and the sim purity gate** — `c7e45ce` (feat)
2. **Task 2: Author the ESLint flat config with the sim-zone import and determinism rules** — `80ae970` (feat)
3. **Task 3: Configure Vitest and add the sim-purity guard test** — `278b232` (feat)

**Plan metadata:** this SUMMARY commit (docs).

## Files Created/Modified

- `tsconfig.json` — strict base project; `include` covers `src/**`, `tests/**`, `*.config.ts`, `eslint.config.js`, `tools/**` so the ESLint project service can find every linted file
- `tsconfig.sim.json` — extends the root project, overrides `lib`/`types`, gates `src/sim/**/*.ts` plus `src/render/camera-relative.ts`, excludes `**/*.test.ts`; comments record both rationales
- `eslint.config.js` — S-6 header, `ignores` → `js.configs.recommended` → `recommendedTypeChecked` → language options (`projectService` + `allowDefaultProject: ["eslint.config.js"]`) → sim zone (imports/globals/properties/syntax all `error`) → `prettier`
- `vitest.config.ts` — one project `unit`, Node env, `include: ["src/**/*.test.ts", "tests/**/*.test.ts"]`
- `tests/guards/sim-purity.test.ts` — "Three import fails lint" and "DOM identifier fails typecheck"; probes written under `src/sim/` at test time (`mkdirSync` recursive) and removed in `finally`
- `.prettierignore` — added `.gsd` (agent runtime state)
- `playwright.config.ts` — device spread moved ahead of the explicit keys (TS2783)
- `AGENTS.md`, `index.html`, `src/main.ts`, `tests/e2e/precision.spec.ts` — Prettier formatting only

## Decisions Made

- The purity project gates `src/render/camera-relative.ts` as well: it is DOM- and Three-free by design, so a future Three import there fails `typecheck`, and the project is non-empty before `src/sim/` exists. Documented in the file itself rather than as prose.
- `tests/guards/sim-purity.test.ts` shells out to the real `npx eslint` / `npx tsc` instead of reimplementing any rule, so the negative proof cannot drift from the gate it claims to prove. Cost: ~6.5 s for the two cases.
- The `lint` stage now owns formatting for the whole tree, so the three source files wave 1 wrote are reformatted here rather than left as a permanent Prettier failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `playwright.config.ts` had a duplicate `viewport` key (TS2783)**
- **Found during:** Task 1 (`docker compose run --rm typecheck` on the new strict project)
- **Issue:** `use: { …, viewport: {...}, ...devices["Desktop Chrome"] }` specifies `viewport` twice — the device descriptor also carries one — so the explicit value was silently overwritten. The new root project surfaces it as `error TS2783: 'viewport' is specified more than once, so this usage will be overwritten.`
- **Fix:** move the `...devices["Desktop Chrome"]` spread ahead of the explicit keys. Desktop Chrome's viewport is already 1280×720, the size every e2e assertion was written against, so behaviour is unchanged and the overwrite hazard is gone.
- **Files modified:** `playwright.config.ts`
- **Verification:** `docker compose run --rm typecheck` exit 0; `docker compose run --rm verify` still passes the e2e stage.
- **Committed in:** `c7e45ce`

**2. [Rule 2 - Missing Critical] Prettier would have walked the GSD runtime directory**
- **Found during:** Task 2 (first `docker compose run --rm lint` after adding the config)
- **Issue:** `prettier --check .` reported `.gsd/dispatch-isolation-sentinel.json`, an untracked file the GSD harness writes at runtime. Formatting it would couple the lint gate to agent state that is not project source.
- **Fix:** added `.gsd` to `.prettierignore` with a one-line reason. No `src/` path was added, so the "never widen the ignore list to make a red gate green" prohibition is intact.
- **Files modified:** `.prettierignore`
- **Verification:** `docker compose run --rm lint` exits 0; `git grep` for `eslint-disable|@ts-ignore|@ts-expect-error` returns nothing.
- **Committed in:** `80ae970`

**3. [Rule 2 - Missing Critical] Formatting drift in wave-1 files would keep `lint` red**
- **Found during:** Task 2 (same run)
- **Issue:** `AGENTS.md`, `index.html`, `src/main.ts` and `tests/e2e/precision.spec.ts` were never Prettier-formatted (wave 1 had no ESLint/Prettier config, so the stage could not pass). FOUND-05 requires formatting drift to fail `lint`, so they had to be formatted, not exempted.
- **Fix:** `docker compose run --rm lint npx prettier --write .` — formatting only (table alignment, line wraps). `index.html`'s footer rewrap is safe because the e2e assertion uses `toContainText`, which normalises whitespace.
- **Files modified:** `AGENTS.md`, `index.html`, `src/main.ts`, `tests/e2e/precision.spec.ts`
- **Verification:** `docker compose run --rm lint` exit 0; `docker compose run --rm verify` exit 0 (e2e still asserts the footer text).
- **Committed in:** `80ae970`

---

**Total deviations:** 3 auto-fixed (1 bug, 2 missing critical).
**Impact on plan:** No scope change. All three are consequences of turning the gates on for the first time: one latent type error the strict project exposed, and two ignore/format bookkeeping items that the `lint` stage cannot pass without.

## Prohibition Review (plan `prohibitions`, flagged for human judgment)

The plan forbids making a red gate green by weakening it. Compliance, verified by inspection:

- No sim-zone rule was demoted to `"warn"` — `grep '"warn"' eslint.config.js` finds only the comment explaining why none exists.
- No inline `eslint-disable`, `@ts-ignore` or `@ts-expect-error` exists anywhere: `git grep -n "eslint-disable\|@ts-ignore\|@ts-expect-error" -- '*.ts' '*.js'` returns nothing.
- The ESLint `ignores` list is exactly `dist/**`, `node_modules/**`, `playwright-report/**`, `test-results/**` — no `src/` entry.
- The only ignore-list change this plan made is `.prettierignore: .gsd`, which is not a source path and not a gate input.
- The two remaining sources of lint noise were fixed at the source (typing/formatting), not silenced.

## Issues Encountered

- Vite still warns that the single JS chunk is 533 kB (> 500 kB). Unchanged from wave 1 and non-fatal; code-splitting is a later-phase concern.
- The guard test adds ~6.5 s to `test` because it starts two real tool processes. Acceptable inside `verify` (whose total run is dominated by build + e2e) and the only way to prove the gates can fail against the actual tooling.
- `.planning/state.json` remains untracked; it is harness state, not a plan artifact.

## Threat Flags

None — this plan adds no network endpoint, auth path, file-access boundary or schema change. The threat register's T-01-04/T-01-05/T-01-06 mitigations are the configs themselves and are exercised by the guard test; T-01-SC holds (no dependency was added or changed — `package.json` and `package-lock.json` are untouched).

## Known Stubs

None.

## Next Phase Readiness

- Ready for plan 01-03: the `unit` project works, so `src/sim/` modules can ship with tests from their first commit.
- The sim zone exists as a rule but not as a directory: `src/sim/` is created by the first sim module (plan 01-03) or by the next guard-test run, which makes and removes it itself.
- `docker compose run --rm verify` is now authoritative on a clean tree — the seeded fail-fast rehearsal is still plan 01-06's job.
- Open follow-up from wave 1 unchanged: the Node unit test for `cameraRelative`/`f32Ulp` arrives in plan 01-04, and the manual GPU stability check is still open for phase verification.

---

*Phase: 01-foundation-containers-compliance*
*Completed: 2026-11-02*

## Self-Check: PASSED

- All five created files exist on disk (`tsconfig.json`, `tsconfig.sim.json`, `eslint.config.js`, `vitest.config.ts`, `tests/guards/sim-purity.test.ts`).
- All three task commits (`c7e45ce`, `80ae970`, `278b232`) are ancestors of HEAD.
- `docker compose run --rm typecheck`, `--rm lint`, `--rm test` and `--rm verify` all exit 0 on the committed tree.
- Both seeded violations fail their gate with the expected diagnostic, and no probe file remains.
- Every `.ts`/`.js` file this plan created starts with the S-6 SPDX header.
