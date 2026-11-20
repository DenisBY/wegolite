---
phase: quick
plan: 261120-ryc
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/e2e/helpers/probe.ts
  - tests/e2e/scene.spec.ts
  - tests/e2e/context-loss.spec.ts
  - tests/e2e/core-loop.spec.ts
  - tests/e2e/docking.spec.ts
  - tests/e2e/flight.spec.ts
  - tests/e2e/hud.spec.ts
  - tests/e2e/launch.spec.ts
  - tests/e2e/probe-shape.spec.ts
  - tests/e2e/settings.spec.ts
  - tests/e2e/station.spec.ts
  - tests/e2e/compliance-shipped.spec.ts
  - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
autonomous: true
requirements: [FOUND-03]

estimate:
  tokens: 60000
  raw_tokens: 60000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "tests/e2e/helpers/probe.ts exports exactly one new constant, FIRST_LAUNCH_WAIT_MS = 180_000, whose comment cites the measured ~70 s full first launch on GitHub CI (run 44796363344, launch.spec.ts 'the first launch plays the full launch view' at 1.2 min), the frame-bound reason (at most 5 fixed steps of 1/120 s per rendered frame, SwiftShader without a GPU), the todo .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md, and the budget rule (non-launch budget plus one FIRST_LAUNCH_WAIT_MS per unskipped launch)"
    - "Every inner wait that failed on run 44796363344 while waiting for a launch to finish now uses FIRST_LAUNCH_WAIT_MS (core-loop through scaled()): the shared waitForMode helpers in context-loss, core-loop, docking and launch, bootToFlight in flight, launch() in hud, startAndLaunch in settings, the in-flight waitForState call in probe-shape, and the single in-flight waits in scene, station (tests at lines 281 and 823) and compliance-shipped"
    - "Every per-test or per-file timeout that governs a test whose launch wait was raised equals its old non-launch budget (old timeout minus launches times old launch wait) plus launches times FIRST_LAUNCH_WAIT_MS, written as that expression in code; no timeout is lowered; compliance-shipped 'booting to flight raises no CSP violation' gains test.setTimeout(30_000 + FIRST_LAUNCH_WAIT_MS)"
    - "No product code changes: this task's commits (subject tag quick-261120-ryc) and any uncommitted edit touch only tests/e2e/ and .planning/; the launch sequence, launchSeen seeding, the launch skip, and every assertion keep their semantics; no launch is skipped that was not skipped before"
    - "docker compose run --rm lint and docker compose run --rm typecheck pass locally, and the eleven changed spec files pass in Chromium on the remote test machine against the committed HEAD"
    - "The todo .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md has a '## Status (2026-11-20, quick task 261120-ryc)' section with the cause, run 44796363344, the constant, the tests changed with their new budgets and the remote result, and it stays in todos/pending"
  artifacts:
    - path: tests/e2e/helpers/probe.ts
      provides: "FIRST_LAUNCH_WAIT_MS, the single ceiling for an inner wait that spans an unskipped launch"
      contains: "export const FIRST_LAUNCH_WAIT_MS = 180_000;"
    - path: tests/e2e/settings.spec.ts
      provides: "startAndLaunch on the constant and seven per-test budgets on the rule"
      contains: "FIRST_LAUNCH_WAIT_MS"
    - path: .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
      provides: "the dated 2026-11-20 status section; the watch continues"
      contains: "## Status (2026-11-20, quick task 261120-ryc)"
  key_links:
    - from: tests/e2e/scene.spec.ts
      to: tests/e2e/helpers/probe.ts
      via: "import { FIRST_LAUNCH_WAIT_MS } used by the in-flight wait and by test.setTimeout"
      pattern: "FIRST_LAUNCH_WAIT_MS"
    - from: tests/e2e/core-loop.spec.ts
      to: tests/e2e/helpers/probe.ts
      via: "scaled(FIRST_LAUNCH_WAIT_MS) in waitForMode and scaled(1_140_000 + FIRST_LAUNCH_WAIT_MS) in the file timeout, keeping the WEGOLITE_E2E_WAIT_SCALE scheme"
      pattern: "scaled\\(FIRST_LAUNCH_WAIT_MS\\)"
    - from: tests/e2e/probe-shape.spec.ts
      to: tests/e2e/helpers/probe.ts
      via: "waitForState(page, \"inFlight\", IN_FLIGHT_KEYS, 1, FIRST_LAUNCH_WAIT_MS) through a new optional timeout parameter that defaults to SLOW (Prettier may wrap the call)"
      pattern: "FIRST_LAUNCH_WAIT_MS"
---

<objective>
Make the sharded GitHub Chromium run pass again by giving every e2e wait that spans an unskipped launch one shared, documented ceiling, FIRST_LAUNCH_WAIT_MS = 180_000, and by raising the per-test or per-file timeouts that contain those waits by a fixed rule. Test-only: no product code, launch sequence, launchSeen seeding or assertion semantics change, and no launch gets skipped.

Purpose: quick tasks 261118-os8 (the 1.5 s pre-roll inside the dock slot), 261118-spu (the HUD drawn during the launch) and Phase 18's cockpit launch view made the full launch longer. The first launch of a fresh browser profile cannot be skipped (launchSeen is false in fresh settings, src/app/session/start-session.ts lines 385-399). On GitHub CI (ubuntu-latest, SwiftShader, no GPU) the session is frame-bound (at most 5 fixed steps of 1/120 s per rendered frame) and the full launch takes about 70 s of real time. PR #1 CI run 44796363344 failed 17 tests, every one at an inner launch wait of 30 s or 60 s (or, in compliance-shipped, at the 30 s default test timeout around a 120 s inner wait). On the remote test machine the whole suite passes (verify-full green at dc34f60).

Output: the constant in tests/e2e/helpers/probe.ts; the inner waits and timeouts in eleven spec files; a dated status section in the CI timeout todo, which stays pending.

Measured facts above come from the orchestrator and are not to be re-derived.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
@tests/e2e/helpers/probe.ts

Reviewer and subagent brief (AGENTS.md): tests and builds run in Docker only; host Node/npm/Playwright are not authoritative and a green host run is not evidence. Commands: docker compose run --rm lint, docker compose run --rm typecheck; browser specs run only on the remote machine through /home/opencode/.claude/scripts/wegolite-remote-run.sh, which syncs the COMMITTED HEAD (commit first). Scratch files live under /tmp, never in the repository. Prefer rg over grep. The codebase-memory MCP (project wegolite), when available, may be used for lookups. Commit atomically; do not push or tag.

The budget rule (applies to every timeout in the table below). For a test whose launch wait is raised, the governing timeout (its own test.setTimeout, else the file-level test.setTimeout, else the 30 s Playwright default) becomes: old non-launch budget + L x FIRST_LAUNCH_WAIT_MS, where L is the number of unskipped launches the test waits through with a raised wait, and the old non-launch budget is the old timeout minus L x the old launch wait. Write it in code as that expression (for example test.setTimeout(60_000 + 2 * FIRST_LAUNCH_WAIT_MS)), so a later change to the constant moves the budgets with it. One exception: compliance-shipped's old 30 s default was already below its old 120 s inner wait, so its non-launch budget is the whole old 30 s default. No timeout is lowered by this rule. A launch that a test skips with a key (docking line 351-352, launch.spec.ts line 222-226) does not count toward L.

Change table (line numbers are at dc34f60; the column "new" is the exact code expression and its value at scale 1):

| File | Inner launch wait: old -> new | Governing timeout: old -> new |
|------|-------------------------------|-------------------------------|
| tests/e2e/scene.spec.ts | test at line 15, in-flight waitForFunction at line 40-49: 30_000 -> FIRST_LAUNCH_WAIT_MS | per-test 60 s (line 19) -> 30_000 + FIRST_LAUNCH_WAIT_MS = 210 s |
| tests/e2e/context-loss.spec.ts | waitForMode helper line 46-57: 60_000 -> FIRST_LAUNCH_WAIT_MS (the helper also serves the docked waits; harmless, it only matters on failure) | file-level 600 s (line 30) -> 540_000 + FIRST_LAUNCH_WAIT_MS = 720 s (tests at 76 and 272 each launch once) |
| tests/e2e/core-loop.spec.ts | waitForMode helper line 108-119: scaled(60_000) -> scaled(FIRST_LAUNCH_WAIT_MS) | file-level scaled(1_200_000) (line 95) -> scaled(1_140_000 + FIRST_LAUNCH_WAIT_MS) = 1,320 s; keep the scaled() scheme, waitReady, UI_WAIT and every other scaled wait unchanged |
| tests/e2e/docking.spec.ts | waitForMode helper line 49-60: 30_000 -> FIRST_LAUNCH_WAIT_MS | file-level 120 s (line 34) unchanged (the non-launching tests at 140, 375, 424 and 500 keep it); test at line 62 gains test.setTimeout(90_000 + FIRST_LAUNCH_WAIT_MS) = 270 s as its first statement; tests at 215, 540 and 600: 180 s -> 150_000 + FIRST_LAUNCH_WAIT_MS = 330 s |
| tests/e2e/flight.spec.ts | bootToFlight line 34-53: 30_000 -> FIRST_LAUNCH_WAIT_MS | file-level 90 s (line 27) -> 60_000 + FIRST_LAUNCH_WAIT_MS = 240 s |
| tests/e2e/hud.spec.ts | launch() line 39-54: 30_000 -> FIRST_LAUNCH_WAIT_MS | test 76: 90 s -> 60_000 + FIRST_LAUNCH_WAIT_MS = 240 s; test 125: 90 s -> 60_000 + FIRST_LAUNCH_WAIT_MS = 240 s; test 223: 480 s -> 450_000 + FIRST_LAUNCH_WAIT_MS = 630 s (its 450 s message wait at line 252 is unchanged) |
| tests/e2e/launch.spec.ts | waitForMode helper line 59-70: 30_000 -> FIRST_LAUNCH_WAIT_MS; waitForPreRoll (line 43-57) stays at 30_000 (it ends when the pre-roll starts, not when the launch finishes) | file-level 120 s (line 32) -> 90_000 + FIRST_LAUNCH_WAIT_MS = 270 s (tests 72, 198, 247 and 332 each play one full launch; test 72 measured 1.2 min = 60 % of the old 120 s on CI) |
| tests/e2e/probe-shape.spec.ts | waitForState (line 140-169) gains a trailing optional parameter timeout = SLOW used as its waitForFunction timeout; the in-flight test (line 294) passes FIRST_LAUNCH_WAIT_MS as that argument; every other caller and waitForFrames keep SLOW | test 288: 60 s (line 290) -> 30_000 + FIRST_LAUNCH_WAIT_MS = 210 s |
| tests/e2e/settings.spec.ts | startAndLaunch line 25-43: 60_000 -> FIRST_LAUNCH_WAIT_MS (each call is a full launch: every call does page.goto and clicks Launch without a skip key) | test 68 (two calls, lines 78 and 100): 180 s -> 60_000 + 2 * FIRST_LAUNCH_WAIT_MS = 420 s; test 150: 120 s -> 60_000 + FIRST_LAUNCH_WAIT_MS = 240 s; test 191: 180 s -> 120_000 + FIRST_LAUNCH_WAIT_MS = 300 s; test 260 (two calls, 270 and 324): 180 s -> 60_000 + 2 * FIRST_LAUNCH_WAIT_MS = 420 s; test 347: 120 s -> 60_000 + FIRST_LAUNCH_WAIT_MS = 240 s; test 397 (two calls, 421 and 457): 240 s -> 120_000 + 2 * FIRST_LAUNCH_WAIT_MS = 480 s; test 482: 240 s -> 180_000 + FIRST_LAUNCH_WAIT_MS = 360 s |
| tests/e2e/station.spec.ts | the in-flight waits in test 281 (line 294-298) and test 823 (line 829-833): 30_000 -> FIRST_LAUNCH_WAIT_MS; the launch waits in test 847 (around lines 891, 1013, 1049) are unchanged (they passed) | file-level 180 s (line 20) unchanged; tests at 281 and 823 each gain test.setTimeout(150_000 + FIRST_LAUNCH_WAIT_MS) = 330 s as their first statement |
| tests/e2e/compliance-shipped.spec.ts | test 111, in-flight wait line 133-137: 120_000 -> FIRST_LAUNCH_WAIT_MS; the docked wait (20 s) is unchanged | no timeout today (30 s default) -> test.setTimeout(30_000 + FIRST_LAUNCH_WAIT_MS) = 210 s as the first statement (the exception noted above) |

Every spec already imports from "./helpers/probe.js"; add FIRST_LAUNCH_WAIT_MS to that existing import (alphabetical order inside the braces, as the files already do). Put any explanatory comment on its own line, never as a trailing comment on a code line (the gates count code lines only).
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer: add FIRST_LAUNCH_WAIT_MS and wire it through scene.spec.ts</name>
  <files>tests/e2e/helpers/probe.ts, tests/e2e/scene.spec.ts</files>
  <read_first>
    - tests/e2e/helpers/probe.ts (the whole file, 51 lines)
    - tests/e2e/scene.spec.ts lines 1-60
    - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md (the Rule and the 2026-11-17 status, for the comment's wording)
  </read_first>
  <action>
    In tests/e2e/helpers/probe.ts, after the imports and before waitForReady, add an exported constant FIRST_LAUNCH_WAIT_MS with the value 180_000 (exactly the line `export const FIRST_LAUNCH_WAIT_MS = 180_000;`) and a JSDoc block above it, written in English, that states: (a) it is the ceiling for an inner wait that spans a launch the test does not skip, and the first launch of a fresh browser profile cannot be skipped (D-10: launchSeen is false in fresh settings) so it plays the pre-roll and the launch view in full; (b) the wait is frame-bound: the session runs at most 5 fixed steps of 1/120 s per rendered frame, and GitHub's ubuntu-latest runner renders on SwiftShader without a GPU; (c) the full first launch took about 70 s of real time on CI run 44796363344 (launch.spec.ts "the first launch plays the full launch view" passed in 1.2 min), and 180 s leaves margin over that; (d) the budget rule: a test or file timeout that covers such a wait is its non-launch budget plus one FIRST_LAUNCH_WAIT_MS per unskipped launch; (e) the CI timeout rule and its history live in .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md (quick task 261120-ryc); (f) it is a correctness wait, not a performance claim (Pitfall 15). Change nothing else in probe.ts (waitForReady keeps 20_000).

    In tests/e2e/scene.spec.ts: add FIRST_LAUNCH_WAIT_MS to the existing import from "./helpers/probe.js"; in the test at line 15, change the per-test timeout to test.setTimeout(30_000 + FIRST_LAUNCH_WAIT_MS) and the in-flight waitForFunction's timeout option to FIRST_LAUNCH_WAIT_MS. Extend the existing comment above test.setTimeout with one own-line sentence saying the budget is the old 30 s non-launch budget plus the first-launch wait (quick 261120-ryc); keep the existing CI measurement sentence and the Pitfall 15 comment above the wait. Do not touch the other scene tests or any assertion.

    Run docker compose run --rm lint; if Prettier reports a formatting difference in the touched files, fix it with docker compose run --rm lint npx prettier --write tests/e2e/helpers/probe.ts tests/e2e/scene.spec.ts and rerun lint. Then commit the two files: test(quick-261120-ryc): add FIRST_LAUNCH_WAIT_MS and use it for the scene launch wait.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>test "$(rg -c 'export const FIRST_LAUNCH_WAIT_MS = 180_000;' tests/e2e/helpers/probe.ts || echo 0)" -eq 1   # [HEAD=0 EXPECT==1]</automated>
    <automated>test "$(rg -c '44796363344' tests/e2e/helpers/probe.ts || echo 0)" -ge 1   # comment cites the CI run [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(rg -c '2026-11-16-ci-e2e-timeout-margins' tests/e2e/helpers/probe.ts || echo 0)" -ge 1   # comment cites the todo [HEAD=0 EXPECT>=1]</automated>
    <automated>c=$(rg -v '^\s*(\*|//)' tests/e2e/scene.spec.ts) && test "$(printf '%s\n' "$c" | rg -c 'test\.setTimeout\(30_000 \+ FIRST_LAUNCH_WAIT_MS\)' || echo 0)" -eq 1   # scene budget [HEAD=0 EXPECT==1]</automated>
    <automated>c=$(rg -v '^\s*(\*|//)' tests/e2e/scene.spec.ts) && test "$(printf '%s\n' "$c" | rg -c 'timeout: FIRST_LAUNCH_WAIT_MS' || echo 0)" -eq 1   # scene launch wait [HEAD=0 EXPECT==1]</automated>
    <automated>c=$(rg -v '^\s*(\*|//)' tests/e2e/scene.spec.ts) && test "$(printf '%s\n' "$c" | rg -c 'FIRST_LAUNCH_WAIT_MS' || echo 0)" -eq 3   # import + wait + budget code lines [HEAD=0 EXPECT==3]</automated>
    <automated>L=$(git log --format= --name-only --grep='quick-261120-ryc' dc34f60..HEAD) && W=$(git diff --name-only HEAD) && test -z "$(printf '%s\n%s\n' "$L" "$W" | rg -v '^(tests/e2e/|\.planning/|$)')"   # out-of-scope file count in this task's commits and uncommitted edits [HEAD=0 EXPECT==0 GUARD MUTATION: an edit under src/ turns it red]</automated>
  </verify>
  <done>probe.ts exports FIRST_LAUNCH_WAIT_MS = 180_000 with the required comment; scene.spec.ts's launch wait and budget use it; lint and typecheck pass in Docker; the two files are committed.</done>
</task>

<task type="auto">
  <name>Task 2: Apply the constant and the budget rule to the other ten specs</name>
  <files>tests/e2e/context-loss.spec.ts, tests/e2e/core-loop.spec.ts, tests/e2e/docking.spec.ts, tests/e2e/flight.spec.ts, tests/e2e/hud.spec.ts, tests/e2e/launch.spec.ts, tests/e2e/probe-shape.spec.ts, tests/e2e/settings.spec.ts, tests/e2e/station.spec.ts, tests/e2e/compliance-shipped.spec.ts</files>
  <read_first>
    - The change table and the budget rule in this plan's context section (the single source of the old and new values)
    - In each file, only the regions the table names: context-loss.spec.ts 26-57; core-loop.spec.ts 60-120; docking.spec.ts 28-62, 215-220, 540-546, 600-606; flight.spec.ts 20-53; hud.spec.ts 15-20, 39-54, 76-80, 125-129, 223-233; launch.spec.ts 26-70; probe-shape.spec.ts 70-75, 125-170, 286-297; settings.spec.ts 10-43 plus the test.setTimeout lines 71, 153, 194, 263, 350, 400, 485; station.spec.ts 15-22, 281-298, 823-833; compliance-shipped.spec.ts 15-20, 111-137
  </read_first>
  <action>
    For each of the ten files, apply exactly the row of the change table: add FIRST_LAUNCH_WAIT_MS to the existing "./helpers/probe.js" import; replace the named inner launch wait's timeout with FIRST_LAUNCH_WAIT_MS (core-loop: scaled(FIRST_LAUNCH_WAIT_MS)); set each governing timeout to the table's expression, adding a test.setTimeout as the first statement of the test where the table says "gains" (docking 62, station 281 and 823, compliance-shipped 111). In probe-shape.spec.ts add the trailing optional parameter timeout with default SLOW to waitForState, pass it to that helper's waitForFunction options in place of SLOW, and pass FIRST_LAUNCH_WAIT_MS as the fifth argument only at the in-flight call (line 294); the docked, menu, paused and chart callers stay as they are. In core-loop.spec.ts keep the WEGOLITE_E2E_WAIT_SCALE scheme: both changed values stay wrapped in scaled(), and nothing else in the file changes.

    Comments: where a timeout already carries a CI-measurement comment (hud.spec.ts test 223, flight.spec.ts line 23-26, scene-style comments elsewhere), keep it and add one own-line sentence that the budget now adds the first-launch wait (quick 261120-ryc, FIRST_LAUNCH_WAIT_MS); in hud.spec.ts test 223 make the last sentence of the comment no longer claim a 480 s budget, and say the 450 s message wait is unchanged. Where a test gains a new test.setTimeout, put a one-line own-line comment above it: the old budget plus the first-launch wait (quick 261120-ryc). Keep comments short, in English, on their own lines.

    Do not change: product code under src/, playwright.config.ts, compose.yaml, .github/, any assertion or its expected value, any wait that the table does not name (waitForReady, waitForPreRoll, UI_WAIT, waitForFrames, the station test-847 launch waits, save-load and every SLOW-constant spec), the order of steps, or the launch path (no key press is added and none removed; no launchSeen seeding). The table's line numbers are at dc34f60; locate each site by its helper or test name if lines shifted.

    Run docker compose run --rm typecheck and docker compose run --rm lint; if Prettier reports a difference, fix only the touched files with docker compose run --rm lint npx prettier --write followed by the touched paths, then rerun lint. Commit the ten files: test(quick-261120-ryc): give every e2e wait that spans the first launch FIRST_LAUNCH_WAIT_MS.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>fail=0; for e in context-loss:1:1:3 core-loop:1:1:3 docking:5:4:6 flight:1:1:3 hud:3:3:5 launch:1:1:3 probe-shape:1:1:3 settings:7:7:9 station:3:2:5 compliance-shipped:1:1:3; do IFS=: read -r f st stf flw <<<"$e"; c=$(rg -v '^\s*(\*|//)' "tests/e2e/$f.spec.ts"); a=$(printf '%s\n' "$c" | rg -c 'test\.setTimeout\(' || true); b=$(printf '%s\n' "$c" | rg 'test\.setTimeout\(' | rg -c FIRST_LAUNCH_WAIT_MS || true); d=$(printf '%s\n' "$c" | rg -c FIRST_LAUNCH_WAIT_MS || true); [ "${a:-0}" -eq "$st" ] && [ "${b:-0}" -eq "$stf" ] && [ "${d:-0}" -eq "$flw" ] || { echo "FAIL $f setTimeout=${a:-0} withConst=${b:-0} const=${d:-0}"; fail=1; }; done; test $fail -eq 0   # per file: setTimeout lines / those using the constant / code lines using the constant; failing-file count [HEAD=10 EXPECT==0]</automated>
    <automated>c=$(rg -v '^\s*(\*|//)' tests/e2e/settings.spec.ts) && test "$(printf '%s\n' "$c" | rg -c 'test\.setTimeout\(60_000 \+ 2 \* FIRST_LAUNCH_WAIT_MS\)' || echo 0)" -eq 2   # settings tests 68 and 260 [HEAD=0 EXPECT==2]</automated>
    <automated>c=$(rg -v '^\s*(\*|//)' tests/e2e/settings.spec.ts) && test "$(printf '%s\n' "$c" | rg -c 'test\.setTimeout\(120_000 \+ 2 \* FIRST_LAUNCH_WAIT_MS\)' || echo 0)" -eq 1   # settings test 397 [HEAD=0 EXPECT==1]</automated>
    <automated>c=$(rg -v '^\s*(\*|//)' tests/e2e/core-loop.spec.ts) && test "$(printf '%s\n' "$c" | rg -c 'scaled\(FIRST_LAUNCH_WAIT_MS\)' || echo 0)" -eq 1   # core-loop waitForMode keeps scaled() [HEAD=0 EXPECT==1]</automated>
    <automated>c=$(rg -v '^\s*(\*|//)' tests/e2e/core-loop.spec.ts) && test "$(printf '%s\n' "$c" | rg -c 'test\.setTimeout\(scaled\(1_140_000 \+ FIRST_LAUNCH_WAIT_MS\)\)' || echo 0)" -eq 1   # core-loop file budget keeps scaled() [HEAD=0 EXPECT==1]</automated>
    <automated>test "$(rg -U -c 'waitForState\(\s*page,\s*"inFlight",\s*IN_FLIGHT_KEYS,\s*1,\s*FIRST_LAUNCH_WAIT_MS,?\s*\)' tests/e2e/probe-shape.spec.ts || echo 0)" -eq 1   # the in-flight call passes the constant, on one line or wrapped by Prettier (the one-line form is exactly 80 columns) [HEAD=0 EXPECT==1]</automated>
    <automated>L=$(git log --format= --name-only --grep='quick-261120-ryc' dc34f60..HEAD) && W=$(git diff --name-only HEAD) && test -z "$(printf '%s\n%s\n' "$L" "$W" | rg -v '^(tests/e2e/|\.planning/|$)')"   # out-of-scope file count in this task's commits and uncommitted edits [HEAD=0 EXPECT==0 GUARD MUTATION: an edit under src/ or to playwright.config.ts turns it red]</automated>
  </verify>
  <done>All ten files follow their table row exactly; every changed governing timeout is the rule's expression; typecheck and lint pass in Docker; the scope guard is empty; the ten files are committed.</done>
</task>

<task type="auto">
  <name>Task 3: Run the eleven changed specs on the remote machine and record the status in the todo</name>
  <files>.planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md</files>
  <read_first>
    - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md (the whole file; match the 2026-11-17 status section's style)
    - The change table in this plan's context section
  </read_first>
  <action>
    First confirm git status is clean for tracked files and HEAD contains the Task 1 and Task 2 commits (the remote script syncs only the committed HEAD). Run the eleven changed spec files once in Chromium on the remote test machine with the command in the first verify line below. If any test fails, read the failure: a failure at a wait this plan did not change, or an assertion failure, is a pre-existing or unrelated problem to report in the SUMMARY and to the orchestrator, not something to fix by widening scope; a failure caused by a Task 1 or Task 2 edit (import, syntax, wrong argument) must be fixed, committed and the run repeated.

    Then append to the todo a section headed exactly "## Status (2026-11-20, quick task 261120-ryc)", after the 2026-11-17 section, in the same bullet style, in English, covering: (1) the cause: quick tasks 261118-os8 (1.5 s pre-roll) and 261118-spu (HUD during the launch) and Phase 18's cockpit launch view lengthened the full launch; the first launch of a fresh profile cannot be skipped (launchSeen false in fresh settings, src/app/session/start-session.ts), and on CI the session is frame-bound (at most 5 fixed steps of 1/120 s per rendered frame on SwiftShader), so the full launch takes about 70 s (launch.spec.ts:72 passed in 1.2 min, 60 % of its old 120 s); (2) the run: PR #1 CI run 44796363344 failed 17 tests, all at an inner launch wait of 30 s or 60 s, or at the 30 s default around compliance-shipped's 120 s wait; (3) the fix: FIRST_LAUNCH_WAIT_MS = 180_000 in tests/e2e/helpers/probe.ts and the budget rule (non-launch budget plus one FIRST_LAUNCH_WAIT_MS per unskipped launch, written as an expression in code); (4) the tests changed, one short line per file with the new budgets from the change table (including the settings and docking tests that share the raised helpers but passed on that run); (5) the remote result: the snapshot SHA, the pass and fail counts and the elapsed time printed by the remote script; (6) the watch continues: after the next sharded CI run, re-measure each launch-spanning test's share of its new budget and apply the Rule; the specs that passed on run 44796363344 with their own launch waits (station test 847, save-load.spec.ts:721, the SLOW-constant specs) were left unchanged and are the first to check. Add tests/e2e/helpers/probe.ts to the todo's front-matter files list. Keep the file in .planning/todos/pending (do not move it to done) and do not change its earlier sections.

    Commit the todo: docs(quick-261120-ryc): record the first-launch wait fix in the CI timeout todo.
  </action>
  <verify>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/scene.spec.ts tests/e2e/context-loss.spec.ts tests/e2e/core-loop.spec.ts tests/e2e/docking.spec.ts tests/e2e/flight.spec.ts tests/e2e/hud.spec.ts tests/e2e/launch.spec.ts tests/e2e/probe-shape.spec.ts tests/e2e/settings.spec.ts tests/e2e/station.spec.ts tests/e2e/compliance-shipped.spec.ts --project=chromium"</automated>
    <automated>test "$(rg -c '^## Status \(2026-11-20, quick task 261120-ryc\)' .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md || echo 0)" -eq 1   # new status heading [HEAD=0 EXPECT==1]</automated>
    <automated>test "$(rg -c '44796363344' .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md || echo 0)" -ge 1   # run id recorded [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(rg -c 'FIRST_LAUNCH_WAIT_MS' .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md || echo 0)" -ge 1   # constant recorded [HEAD=0 EXPECT>=1]</automated>
    <automated>test "$(rg -c '^## Status \(2026-11-17' .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md || echo 0)" -eq 1   # earlier section kept [HEAD=1 EXPECT==1 GUARD MUTATION: rewriting or deleting the 2026-11-17 section turns it red]</automated>
    <automated>test -f .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md   # stays pending [HEAD=present EXPECT==present GUARD MUTATION: moving the todo to todos/done turns it red]</automated>
    <automated>test ! -e .planning/todos/done/2026-11-16-ci-e2e-timeout-margins.md   # not moved to done [HEAD=absent EXPECT==absent GUARD MUTATION: moving the todo to todos/done turns it red]</automated>
    <automated>L=$(git log --format= --name-only --grep='quick-261120-ryc' dc34f60..HEAD) && W=$(git diff --name-only HEAD) && test -z "$(printf '%s\n%s\n' "$L" "$W" | rg -v '^(tests/e2e/|\.planning/|$)')"   # out-of-scope file count in this task's commits and uncommitted edits [HEAD=0 EXPECT==0 GUARD MUTATION: an edit under src/ turns it red]</automated>
    <automated>S=$(git status --porcelain --untracked-files=all) && test -z "$(printf '%s\n' "$S" | rg '^\?\? ' | rg -v '261120-ryc')"   # untracked stray scratch file count [HEAD=0 EXPECT==0 GUARD MUTATION: an untracked scratch spec under tests/e2e/ turns it red]</automated>
  </verify>
  <done>The eleven changed specs pass in Chromium on the remote machine at the committed HEAD (or any unrelated failure is reported with its cause); the todo carries the dated 2026-11-20 status section with the cause, run id, constant, tests, budgets and remote result, stays in pending, and is committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Test-only change to Playwright wait ceilings and test timeouts; no product code, input handling, persistence, CSP or network guard changes, and no new dependency. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261120-01 | Tampering | tests/e2e assertions | low | mitigate | The scope guard (files in this task's commits and uncommitted edits limited to tests/e2e/ and .planning/) and the per-file gates restrict the edit to wait ceilings and budgets; the plan forbids changing assertions, expected values, the launch path or launchSeen seeding, so a longer ceiling cannot hide a behaviour change, only a slower one. |
| T-261120-02 | Denial of service | CI wall time on failure | low | accept | A hung test now fails after up to 630 s (hud 223) or 1,320 s (core-loop) instead of 480 s or 1,200 s; the inner FIRST_LAUNCH_WAIT_MS wait still fails first with a specific message, and the shards run in parallel. |
| T-261120-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed or changed by this plan; package.json and package-lock.json are untouched (covered by the scope guard). |
</threat_model>

<verification>
- docker compose run --rm typecheck and docker compose run --rm lint pass locally (Tasks 1 and 2).
- The per-file gate loop reports no FAIL line; the constant gate, the core-loop scaled() gate, the probe-shape call gate and the settings two-launch gates pass.
- The eleven changed spec files pass in Chromium on the remote machine against the committed HEAD.
- The files in this task's commits (subject tag quick-261120-ryc, since dc34f60) and any uncommitted edit are only tests/e2e/ and .planning/ paths. (HEAD moved to 0828f81, an unrelated README commit, while this plan was written; the spec line numbers in the change table are unaffected.)
- The todo has the 2026-11-20 status section and is still under .planning/todos/pending.
- No CHANGELOG entry: an internal test-only change (AGENTS.md "Versioning and changelog" allows omitting tests). No verify or verify-full run is required for this test-only change; the real proof is the next sharded GitHub CI run, which the owner triggers by pushing.
</verification>

<success_criteria>
- One exported constant, FIRST_LAUNCH_WAIT_MS = 180_000, documents the ~70 s CI first launch, the frame-bound cause and the todo.
- All 17 failing tests of run 44796363344 now wait up to FIRST_LAUNCH_WAIT_MS for the launch and have a governing timeout of their old non-launch budget plus one FIRST_LAUNCH_WAIT_MS per unskipped launch; tests sharing the raised helpers follow the same rule.
- No product code, launch behaviour, launchSeen seeding or assertion semantics changed; nothing is pushed or tagged.
- The CI timeout todo records the cause, the run, the constant and the tests, and stays pending.
</success_criteria>

<output>
Create `.planning/quick/261120-ryc-raise-the-e2e-waits-that-span-the-first-/261120-ryc-SUMMARY.md` when done
</output>
