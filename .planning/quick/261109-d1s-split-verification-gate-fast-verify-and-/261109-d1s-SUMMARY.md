---
quick_id: 261109-d1s
status: complete
completed: 2026-11-09
requirements: [FOUND-03, FOUND-09]
commits: 0
plan_head_before: 1a41cdd83784fbf05db0bd08f99ef5b4f6148ad5
plan_head_after: 1a41cdd83784fbf05db0bd08f99ef5b4f6148ad5
actuals:
  tasks: 3
  commits: 0
---

# Quick Task 261109-d1s: Split the verification gate into fast `verify` and release `verify-full`

`verify` now ends in an 18-test Chromium smoke subset (`npm run test:e2e:fast`), and the new `verify-full` service runs the same fail-fast chain with the full 92-test Chromium suite. Both gates are green in the container. Nothing is committed.

## Gate results

Both gates ran in the container, one after the other, from the worktree bind mount.

| Gate | Command | Exit code | Wall time | Unit tests | Playwright |
| ---- | ------- | --------- | --------- | ---------- | ---------- |
| Fast | `docker compose run --rm verify` | 0 | 275 s (4.6 min) | 94 files, 1188 passed, 1 skipped | 18 passed (2.6 min), 0 failed, 0 flaky |
| Full | `docker compose run --rm verify-full` | 0 | 1546 s (25.8 min) | 94 files, 1188 passed, 1 skipped | 92 passed (23.8 min), 0 failed, 0 flaky |

Notes on the runs:

- Host load during `verify-full` rose to about 8.6 on 4 CPUs, the same band as the red 07-11 run (1987 s, five load timeouts). This run had no timeouts and needed no rerun.
- Lint, typecheck, `assets:check` and build passed as chain stages in both runs.
- The contract suites also passed on their own: `container-contract`, `readme` and `fidelity` (49 passed, 1 skipped), `lint` and `typecheck` exit 0.

## What changed

Changed files (all uncommitted):

- `package.json`: new script `test:e2e:fast` = `playwright test --project=chromium tests/e2e/scene.spec.ts tests/e2e/docking.spec.ts tests/e2e/save-load.spec.ts`. `test:e2e` and `test:e2e:cross` are byte-identical.
- `compose.yaml`: `verify` last stage is now `npm run test:e2e:fast` (comment added). New service `verify-full` on the shared workspace anchor with `ipc: host`, no `depends_on`, no `profiles`, no ports, no target override. Its chain is `lint && typecheck && assets:check && test && build && test:e2e`.
- `tests/contract/container-contract.test.ts`: gate-topology pins only (owner decision 1). `verify` chain pin ends in `test:e2e:fast`; the `test:e2e:fast` script is pinned exactly with a guard of exactly 3 spec paths that must exist; `verify-full` joins both service arrays; `verify-full` is asserted free of `e2e-cross`; a new test pins the `verify-full` chain.
- `AGENTS.md`: Docker workflow block, one sentence on when each gate runs, and the quick-reference table (relabelled `verify` row plus a `verify-full` row). No other rule changed.
- `README.md`: Commands table, Supported browsers sentence, the Ports bullet and the Definition of done bullet.
- `.planning/PROJECT.md`: one new Key Decisions row (Pending, owner decision 2026-11-08).
- `.github/workflows/verify.yml`: the run command is now `docker compose run --rm verify-full` (owner decision 2).

**CI now runs the full gate.** `.github/workflows/verify.yml` runs `docker compose run --rm verify-full` on push to `main` and on pull requests. Expect about 33 minutes per run (owner estimate; the local run here took 25.8 min). The job timeout of 120 minutes is unchanged. The step name still reads "Full gate (unit, e2e, lint, typecheck, assets, contract)" and is now accurate.

Not touched: any spec, helper, `playwright.config.ts`, any file under `.planning/phases/07-hardening-community-release/`, `ROADMAP.md`.

## Fast subset membership and rationale

`test:e2e:fast` lists three whole spec files (explicit paths, no `file:line` or `--grep`, so no spec or Playwright config change and no silent drift):

- `scene.spec.ts` (3 tests): title, New game and launch.
- `docking.spec.ts` (7 tests): the dock paths (manual aligned dock, the bounce, the docking computer), driven through the test hook rather than long flights.
- `save-load.spec.ts` (8 tests): manual Save to the slot, the overwrite confirm, in-session Load and page reloads.

Total 18 tests. These cover the smoke items the owner named. Every other spec stays only in `test:e2e`, and so in `verify-full`: core-loop, autosave, hyperspace, hyperspace-failure, hud, throttle, context-loss, budget, engine, compliance-shipped, settings, station, launch, flight, dispose, fallback, aspect, resize, models and precision. Playwright still starts both web servers (including the seams build on port 4175) for any spec selection; that fixed start-up cost stays in the fast gate because the Playwright config must not change.

## Deviations from the plan

1. **[Brief deviation, approved by owner decision 1] Contract test and README changed.** `container-contract.test.ts` pins the exact `verify` chain, and FOUND-09 requires declared services to equal the documented targets in both AGENTS.md and README.md. Without the pin change `verify` would fail its own unit stage, and without a README target `verify-full` fails the set equality. Edits were kept to gate-topology pins and four README statements.
2. **[Owner decision 2] CI switched to `verify-full`.** This replaces the plan's note that CI keeps running only `verify`. As a consequence the AGENTS.md comment for `verify` could not say "CI runs this" as the plan prescribed. It reads "Run the fast gate (lint, typecheck, content drift, unit tests, build, e2e smoke subset)", and the `verify-full` comment and the new when-to-run sentence say CI runs `verify-full`. The README Definition of done bullet says the same.
3. **[Precondition note, Task 3] A `wegolite-preview-1` container was running** (owner's preview service, up about 19 minutes, 0.00% CPU, 79 MiB), so the strict "no `wegolite-` container" precondition was not literally met. It publishes host port 4173, but Playwright's servers bind inside the test container's own network namespace, so there is no port conflict, and it added no load. I ran the gates with it left untouched rather than stopping the owner's container.
4. The Task 1 and Task 2 contract edits were made in one pass (the `verify-full` service and pins were added together with the subset). The contract suite was verified red-then-green in between: with only Task 1 applied it failed solely on the FOUND-09 set equality, which is the expected docs-pending state.

No auth gates. No stubs. No new dependencies or lockfile changes, so no image rebuild or `down --volumes` was needed.

## Phase 7 plans that still reference `verify` as the release gate

Not edited (owner decision 6). All files are in `.planning/phases/07-hardening-community-release/`. Line numbers are as of 2026-11-09.

1. `07-04-PLAN.md`
   - Line 19, must_haves truth: "tests/e2e/engine.spec.ts ... passes on Chromium inside docker compose run --rm verify."
   - After the split, `engine.spec.ts` is not in `test:e2e:fast`. It runs in `verify-full` (and on Firefox in `e2e-cross`), so the truth would read `verify-full`.
2. `07-09-PLAN.md`
   - Line 26, must_haves truth: "`docker compose run --rm verify` stays Chromium-only: the `test:e2e` script runs only the chromium project, the verify chain string is unchanged".
   - Line 215, `<verification>`: "The full `docker compose run --rm verify` (Chromium-only) is run by plan 07-11."
   - Related lines without the literal command: line 44 (key_link "verify chain -> npm run test:e2e"), line 143 (action) and line 220 (`<success_criteria>`: "its chain string is unchanged").
   - Chromium-only still holds for both gates. The chain string changes.
3. `07-10-PLAN.md`
   - Line 116, `<action>`: the README content "`docker compose run --rm verify` runs the full suite on Chromium".
   - This is action text, not an acceptance criterion. This task changes that README sentence to `verify-full`.
4. `07-11-PLAN.md`. This is the release plan and the highest-priority revision candidate: under the new rule its release gate is `verify-full`.
   - Line 24, must_haves truth: verify (the definition of done) and e2e-cross both pass on the commit offered for publication.
   - Line 131, `<action>`: run verify and e2e-cross.
   - Line 136: `<automated>docker compose run --rm verify</automated>`.
   - Line 144, `<acceptance_criteria>`.
   - Line 158, checkpoint "Already done by Claude".
   - Line 200, `<verification>`.
   - 07-11-SUMMARY records the last full `verify` as red: five timeouts under load.

Related, without the literal command: `07-12-PLAN.md` line 106 (`<action>`: "the verify chain string is unchanged"). That plan is complete, and its statement is superseded by this split.

## Open owner follow-ups (not changed)

- AGENTS.md, Reviewer and subagent brief (line 43) still labels `docker compose run --rm verify` "(full gate)". Owner decision scope forbade other AGENTS.md rule changes, so it stays. The owner may relabel it "fast gate" and add `verify-full`.
- `scripts/check-verify-fails-fast.sh` still rehearses fail-fast on `docker compose run --rm verify`. That remains valid for the fast gate; `verify-full` shares the same chain shape and is pinned by the contract.
- `.planning/phases/07-hardening-community-release/07-05-PLAN.md` and `.planning/state.json` had uncommitted edits in the main checkout before this task; they are not in this worktree and were not touched.
- This worktree did not contain the untracked quick-task PLAN.md; it was read from the main checkout at `/home/opencode/git/wegolite/.planning/quick/261109-d1s-split-verification-gate-fast-verify-and-/261109-d1s-PLAN.md`.

## Self-Check: PASSED

- `package.json`, `compose.yaml`, `tests/contract/container-contract.test.ts`, `AGENTS.md`, `README.md`, `.planning/PROJECT.md`, `.github/workflows/verify.yml` are modified (`git status --short`).
- `git rev-parse HEAD` equals `plan_head_before`: nothing was committed.
- `git status` shows no changes under `tests/e2e`, `playwright.config.ts` or `.planning/phases/`.
- Both gates exited 0; the 18 and 92 Playwright counts are from the logs.
