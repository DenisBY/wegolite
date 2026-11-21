---
phase: quick
plan: 261121-bjl
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/e2e/hyperspace.spec.ts
  - tests/e2e/core-loop.spec.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/budget.spec.ts
  - tests/e2e/save-load.spec.ts
  - tests/e2e/station-tabs.spec.ts
  - tests/e2e/throttle.spec.ts
  - tests/e2e/settings.spec.ts
  - tests/e2e/station.spec.ts
  - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
autonomous: true
requirements: [FOUND-03]

estimate:
  tokens: 55000
  raw_tokens: 55000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "hyperspace.spec.ts: the shared waitForMode helper waits up to FIRST_LAUNCH_WAIT_MS; the test 'chart target, countdown, abort, refusal, arrival and reload' has test.setTimeout(1_140_000 + FIRST_LAUNCH_WAIT_MS); the test 'a jump completed beside the station is refused as blocked' gains test.setTimeout(540_000 + FIRST_LAUNCH_WAIT_MS) as its first statement; the file-level 600 s stays for the non-launching arrow-key test"
    - "core-loop.spec.ts: the Diso arrival wait (systemId === DISO_ID after the countdown starts) is scaled(360_000), and the file budget is scaled(1_320_000 + FIRST_LAUNCH_WAIT_MS), the old budget raised by exactly the same 180 s; the scaled() scheme is kept"
    - "autosave, budget, save-load, station-tabs and throttle: the waitForMode helper waits up to FIRST_LAUNCH_WAIT_MS, and every test that waits through one unskipped launch with that helper has a governing timeout equal to its old non-launch budget plus FIRST_LAUNCH_WAIT_MS, written as that expression"
    - "settings.spec.ts 'the Show FPS toggle ...' and station.spec.ts 'the whole station computer is keyboard-only ...' wait up to FIRST_LAUNCH_WAIT_MS for each of their two unskipped launches, with budgets 120_000 + 2 * FIRST_LAUNCH_WAIT_MS and 60_000 + 2 * FIRST_LAUNCH_WAIT_MS"
    - "Every launch-adjacent wait that was left unchanged is listed in this plan and in the todo with the reason (manual clock, pre-roll-only wait, skipped relaunch, load into flight, post-launch flight wait)"
    - "No product code changes: this task's commits (subject tag quick-261121-bjl) and any uncommitted edit touch only tests/ and .planning/; no assertion, expected value, launch path, skip key or launchSeen seeding changes; no timeout is lowered"
    - "docker compose run --rm lint, docker compose run --rm typecheck and the full unit suite docker compose run --rm test pass locally before the last commit, and the nine changed spec files pass in Chromium on the remote test machine against the committed HEAD"
    - "The todo .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md has a '## Status (2026-11-21, quick task 261121-bjl)' section and stays in todos/pending"
  artifacts:
    - path: tests/e2e/hyperspace.spec.ts
      provides: "waitForMode on FIRST_LAUNCH_WAIT_MS and two launch budgets on the rule"
      contains: "test.setTimeout(1_140_000 + FIRST_LAUNCH_WAIT_MS)"
    - path: tests/e2e/core-loop.spec.ts
      provides: "the widened frame-bound arrival wait and the raised file budget"
      contains: "scaled(360_000)"
    - path: .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
      provides: "the dated 2026-11-21 status section; the watch continues"
      contains: "## Status (2026-11-21, quick task 261121-bjl)"
  key_links:
    - from: tests/e2e/hyperspace.spec.ts
      to: tests/e2e/helpers/probe.ts
      via: "import { FIRST_LAUNCH_WAIT_MS } used by waitForMode and two test.setTimeout expressions"
      pattern: "FIRST_LAUNCH_WAIT_MS"
    - from: tests/e2e/core-loop.spec.ts
      to: tests/e2e/helpers/probe.ts
      via: "test.setTimeout(scaled(1_320_000 + FIRST_LAUNCH_WAIT_MS)) keeps the WEGOLITE_E2E_WAIT_SCALE scheme"
      pattern: "scaled\\(1_320_000 \\+ FIRST_LAUNCH_WAIT_MS\\)"
    - from: tests/e2e/station-tabs.spec.ts
      to: tests/e2e/helpers/probe.ts
      via: "import { FIRST_LAUNCH_WAIT_MS } used by waitForMode and three per-test budgets"
      pattern: "FIRST_LAUNCH_WAIT_MS"
---

<objective>
Finish the sweep that quick 261120-ryc started: every e2e wait that spans an unskipped launch in real time gets the shared ceiling FIRST_LAUNCH_WAIT_MS (180 s, tests/e2e/helpers/probe.ts), with the governing test or file timeout raised by the same budget rule, and the core-loop Diso arrival wait is widened to the 360 s that the other specs already use for the same frame-bound arrival. Test-only: no product code, launch sequence, skip key, launchSeen seeding or assertion changes.

Purpose: main CI run 44812771006 (commit 20a9942) failed shard 2 on a slow runner (16.4 min against about 10 min for the other shards). hyperspace.spec.ts:196 and :614 timed out in waitForMode (60 s) right after the first launch (Digit1), the same root cause as 261120-ryc, missed then because that file passed on run 44796363344. core-loop.spec.ts:269 timed out in the arrival wait after the 15 s countdown, a frame-bound wait (at most 5 fixed steps of 1/120 s per rendered frame on SwiftShader, so at least 360 rendered frames) that hyperspace.spec.ts and the autosave trigger matrix already give 360 s.

Output: launch waits and budgets in nine spec files; a dated status section in the CI timeout todo, which stays pending. The measured facts above come from the orchestrator and are not to be re-derived.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/quick/261120-ryc-raise-the-e2e-waits-that-span-the-first-/261120-ryc-SUMMARY.md
@.planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
@tests/e2e/helpers/probe.ts

Reviewer and subagent brief (AGENTS.md): tests and builds run in Docker only; host Node/npm/Playwright are not authoritative and a green host run is not evidence. Local commands: docker compose run --rm lint, docker compose run --rm typecheck, docker compose run --rm test. Browser specs run only on the remote machine through /home/opencode/.claude/scripts/wegolite-remote-run.sh, which syncs the COMMITTED HEAD (commit first). Scratch files live under /tmp and are mounted into the container, never added to the repository. Prefer rg over grep. The codebase-memory MCP (project wegolite), when available, may be used for lookups. Commit atomically with the subject tag quick-261121-bjl; do not push or tag. No CHANGELOG entry (internal test-only change).

The budget rule (quick 261120-ryc, reused exactly). For a test whose launch wait is raised, the governing timeout (its own test.setTimeout, else the file-level test.setTimeout) becomes: old non-launch budget + L x FIRST_LAUNCH_WAIT_MS, where L is the number of unskipped launches the test waits through with a raised wait and the old non-launch budget is the old timeout minus L x the old launch wait. Write it in code as that expression. Where a file-level timeout also governs tests that do not launch, keep the file-level value and give each launching test its own test.setTimeout as its first statement (the docking.spec.ts precedent); where every test in the file launches once, change the file-level value (the context-loss.spec.ts precedent). No timeout is lowered. A launch the test skips with a key does not count toward L.

Why a second launch counts: launchSeen only makes the skip key work (src/app/session/start-session.ts onLaunchKeyDown, D-10); a later launch with no key pressed plays the same pre-roll and launch view in full, so it is as long and as frame-bound as the first. 261120-ryc already counted such launches (the settings tests with two startAndLaunch calls).

Guard lesson (261120-ryc, commit a9b33e1): tests/render/planet-budget.test.ts pins literal timeout strings from tests/e2e/hud.spec.ts. At 20a9942 it is the only non-e2e test that reads an e2e spec's source, and it reads only hud.spec.ts, which this plan does not touch. Still, before changing any timeout literal, run rg -n -F with that literal over tests with the glob '!tests/e2e/**'; if a hit is a guard that reads the spec being changed, update it in the same commit so it pins the new expression and still rejects a shortened timeout.

Change table (line numbers at 20a9942; "new" is the exact code expression and its value at scale 1):

| File | Inner launch wait: old -> new | Governing timeout: old -> new |
|------|-------------------------------|-------------------------------|
| tests/e2e/hyperspace.spec.ts | waitForMode helper (lines 50-61, timeout line 59): 60 s -> FIRST_LAUNCH_WAIT_MS. It also serves the docked waits and the two Continue-into-flight waits (lines 424, 541); harmless, it only matters on failure | test 196 (setTimeout line 203): 1,200 s -> 1_140_000 + FIRST_LAUNCH_WAIT_MS = 1,320 s; test 614 (one launch, line 628-629): file 600 s -> gains test.setTimeout(540_000 + FIRST_LAUNCH_WAIT_MS) = 720 s; file-level 600 s (line 30) stays for test 554, which never launches |
| tests/e2e/core-loop.spec.ts | not a launch wait: the Diso arrival wait (lines 319-323, timeout line 322) after the 15 s countdown: scaled 180 s -> scaled(360_000) | file-level (lines 95-97): the non-launch part rises by the same 180 s, 1,140 s -> 1,320 s, so the expression becomes scaled(1_320_000 + FIRST_LAUNCH_WAIT_MS) = 1,500 s at scale 1 |
| tests/e2e/autosave.spec.ts | waitForMode helper (lines 84-95, timeout line 93): 60 s -> FIRST_LAUNCH_WAIT_MS | test 317 (one launch, inFlight wait line 324): file 600 s -> gains test.setTimeout(540_000 + FIRST_LAUNCH_WAIT_MS) = 720 s; test 443 trigger matrix (one launch, line 525-526; setTimeout line 450): 1,200 s -> 1_140_000 + FIRST_LAUNCH_WAIT_MS = 1,320 s; file-level 600 s (line 50) stays; its comment (lines 47-49) must stop claiming the matrix sets 1,200 s |
| tests/e2e/budget.spec.ts | waitForMode helper (lines 159-170, timeout line 168): 60 s -> FIRST_LAUNCH_WAIT_MS | file-level 300 s (line 46) -> 240_000 + FIRST_LAUNCH_WAIT_MS = 420 s (tests 217, 234 and 255 each wait through one launch; 234 continues a docked save in a fresh profile, so its launch is unskipped too) |
| tests/e2e/save-load.spec.ts | waitForMode helper (lines 114-125, timeout line 123): 60 s -> FIRST_LAUNCH_WAIT_MS | tests 250 (launch line 279-280) and 639 (launch line 683-684): file 360 s -> each gains test.setTimeout(300_000 + FIRST_LAUNCH_WAIT_MS) = 480 s; file-level 360 s (line 41) stays |
| tests/e2e/station-tabs.spec.ts (found by the planner's sweep, not in the orchestrator's list) | waitForMode helper (lines 70-76, timeout line 74; used only by the three in-flight waits): 60 s -> FIRST_LAUNCH_WAIT_MS | tests 390 (Launch tab, line 394-395), 650 (Digit1, line 656-657) and 935 (Digit1, line 979-980): file 180 s -> each gains test.setTimeout(120_000 + FIRST_LAUNCH_WAIT_MS) = 300 s; file-level 180 s (line 20) stays |
| tests/e2e/throttle.spec.ts | waitForMode helper (lines 40-51, timeout line 49): 60 s -> FIRST_LAUNCH_WAIT_MS | file-level 600 s (line 24) -> 540_000 + FIRST_LAUNCH_WAIT_MS = 720 s (tests 115 and 167 each wait through one launch) |
| tests/e2e/settings.spec.ts | test 492 "the Show FPS toggle ...": the second launch's in-flight wait (lines 537-547, timeout line 546): 60 s -> FIRST_LAUNCH_WAIT_MS (the first launch is startAndLaunch, already on the constant) | test 492 (setTimeout line 496): 180 s + one constant -> 120_000 + 2 * FIRST_LAUNCH_WAIT_MS = 480 s (old 240 s minus two 60 s launch waits = 120 s) |
| tests/e2e/station.spec.ts | test 857 "the whole station computer is keyboard-only ...": both in-flight waits, after the first launch (lines 1020-1024, timeout line 1023) and after the reload's launch (lines 1056-1060, timeout line 1059): 60 s -> FIRST_LAUNCH_WAIT_MS | test 857: file 180 s -> gains test.setTimeout(60_000 + 2 * FIRST_LAUNCH_WAIT_MS) = 420 s as its first statement; file-level 180 s (line 24) stays |

Left unchanged, with the reason (record these in the SUMMARY and the todo):

| Wait | Why it does not span a real-time launch |
|------|------------------------------------------|
| probe-shape (except the in-flight call 261120-ryc changed), combat, laser-shots, statics, npc-flight, tick-hook, traffic: the SLOW = 30_000 waits | They boot with ?test=1&clock=manual and step the launch with advanceTicks (LAUNCH_TICKS or 600 ticks); the in-flight wait after that only waits for a frame to publish the probe. tick-hook's ?clock=manual&traffic=1 case does not launch |
| engine.spec.ts:119 (90 s) | Ends at launching or inFlight, i.e. when the sim launch starts after the 1.5 s pre-roll, not when the launch view finishes (like launch.spec.ts waitForPreRoll, kept at 30 s by 261120-ryc) |
| docking.spec.ts:252 (60 s) | The 2 s departure wait after waitForMode inFlight has already returned (raised by 261120-ryc); the relaunch at line 358 is skipped with the x key |
| autosave launchAndAwaitCommit (90 s, line 224), the launching waits (tests 293 and the unreadable/oversized-blob tests), save-load.spec.ts:398 waitForCommitted(3), station.spec.ts:1025-1029 save wait and station.spec.ts New-game test's commit wait (line 1106) | The pre-launch anchor is written on the fixed step that ends the 1.5 s pre-roll (src/app/session/sim-driver.ts drain, quick 261118-os8), before the launch view plays; these waits span at most the pre-roll |
| hyperspace.spec.ts:375 (60 s) | The arrival-save commit wait after the jump; no launch |
| save-load.spec.ts:717-721, hyperspace-failure.spec.ts:117, autosave.spec.ts:661 | Continue or Load straight into flight; no launch |
</context>

<tasks>

<task type="tracer">
  <name>Task 1: Tracer: the two measured CI failures (hyperspace.spec.ts and core-loop.spec.ts)</name>
  <files>tests/e2e/hyperspace.spec.ts, tests/e2e/core-loop.spec.ts</files>
  <read_first>
    - The change table, the budget rule and the guard lesson in this plan's context section
    - tests/e2e/hyperspace.spec.ts lines 18-62, 196-204, 614-630
    - tests/e2e/core-loop.spec.ts lines 60-98 and 300-325
  </read_first>
  <action>
    Guard check first: for each timeout literal this task changes (hyperspace's 60 s helper timeout and the 1,200 s per-test budget; core-loop's 180 s scaled arrival timeout and its file budget expression), run rg -n -F with the literal over tests with the glob '!tests/e2e/**'. Expected: no guard reads hyperspace.spec.ts or core-loop.spec.ts (the only spec-reading guard, tests/render/planet-budget.test.ts, reads hud.spec.ts). If one does, update it in this task's commit so it pins the new expression and still rejects a shortened timeout.

    hyperspace.spec.ts (row 1 of the change table): add FIRST_LAUNCH_WAIT_MS to the existing "./helpers/probe.js" import (alphabetical inside the braces; Prettier will wrap it). In waitForMode set the timeout option to FIRST_LAUNCH_WAIT_MS. In the test "chart target, countdown, abort, refusal, arrival and reload" replace the 1,200 s budget with test.setTimeout(1_140_000 + FIRST_LAUNCH_WAIT_MS); keep the existing 71 % comment and add one own-line sentence: the 1,140 s non-launch budget plus the first-launch wait (quick 261121-bjl; CI run 44812771006 timed out at the 60 s launch wait). In the test "a jump completed beside the station is refused as blocked" add test.setTimeout(540_000 + FIRST_LAUNCH_WAIT_MS) as the first statement with a one-line own-line comment above it: the old 600 s file budget's 540 s non-launch part plus the first-launch wait (quick 261121-bjl). Keep the file-level 600 s and every other wait (line 375 included).

    core-loop.spec.ts (row 2): replace the 180-second scaled timeout of the Diso arrival wait (the waitForFunction on systemId === DISO_ID after the countdown starts) with scaled(360_000), and put one own-line comment above that timeout option: frame-bound, the 15 s countdown needs at least 360 rendered frames; 360 s as in hyperspace.spec.ts and the autosave trigger matrix (quick 261121-bjl, CI run 44812771006). Change the file budget to test.setTimeout(scaled(1_320_000 + FIRST_LAUNCH_WAIT_MS)) and rewrite the comment above it: the 1,140 s non-launch budget plus 180 s for the widened arrival wait (quick 261121-bjl), plus the first-launch wait (quick 261120-ryc). Keep the scaled() scheme, UI_WAIT, waitReady, waitForMode and the fly-away wait unchanged.

    Comments in English, on their own lines, never trailing a code line. Do not change product code, assertions or the launch path. Run docker compose run --rm typecheck and docker compose run --rm lint; if Prettier reports a difference, run docker compose run --rm lint npx prettier --write on the two files and rerun lint. Commit the two files: test(quick-261121-bjl): give the hyperspace launch waits FIRST_LAUNCH_WAIT_MS and widen the core-loop arrival wait.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>fail=0; for e in hyperspace:3:2:4 core-loop:1:1:3; do IFS=: read -r f st stf flw <<<"$e"; c=$(rg -v '^\s*(\*|//)' "tests/e2e/$f.spec.ts"); a=$(printf '%s\n' "$c" | rg -c 'test\.setTimeout\(' || true); b=$(printf '%s\n' "$c" | rg 'test\.setTimeout\(' | rg -c FIRST_LAUNCH_WAIT_MS || true); d=$(printf '%s\n' "$c" | rg -c FIRST_LAUNCH_WAIT_MS || true); [ "${a:-0}" -eq "$st" ] && [ "${b:-0}" -eq "$stf" ] && [ "${d:-0}" -eq "$flw" ] || { echo "FAIL $f setTimeout=${a:-0} withConst=${b:-0} const=${d:-0}"; fail=1; }; done; test $fail -eq 0   # per file: setTimeout code lines / those using the constant / code lines using the constant; failing-file count [HEAD=1 EXPECT==0]</automated>
    <automated>f=0; g(){ c=$(rg -v '^\s*(\*|//)' "tests/e2e/$1.spec.ts"); n=$(printf '%s\n' "$c" | rg -c "$2" || true); [ "${n:-0}" -eq "$3" ] || { echo "FAIL $1 $2 = ${n:-0}"; f=$((f+1)); }; }; g hyperspace 'test\.setTimeout\(1_140_000 \+ FIRST_LAUNCH_WAIT_MS\)' 1; g hyperspace 'test\.setTimeout\(540_000 \+ FIRST_LAUNCH_WAIT_MS\)' 1; test $f -eq 0   # hyperspace budget expressions; failing-check count [HEAD=2 EXPECT==0]</automated>
    <automated>f=0; g(){ c=$(rg -v '^\s*(\*|//)' "tests/e2e/$1.spec.ts"); n=$(printf '%s\n' "$c" | rg -c "$2" || true); [ "${n:-0}" -eq "$3" ] || { echo "FAIL $1 $2 = ${n:-0}"; f=$((f+1)); }; }; g hyperspace 'test\.setTimeout\(1_200_000\)' 0; g hyperspace 'test\.setTimeout\(600_000\)' 1; g hyperspace 'timeout: 60_000' 1; test $f -eq 0   # old per-test budget gone, file budget kept, only the line-375 save wait keeps 60 s; failing-check count [HEAD=2 EXPECT==0]</automated>
    <automated>f=0; g(){ c=$(rg -v '^\s*(\*|//)' "tests/e2e/$1.spec.ts"); n=$(printf '%s\n' "$c" | rg -c "$2" || true); [ "${n:-0}" -eq "$3" ] || { echo "FAIL $1 $2 = ${n:-0}"; f=$((f+1)); }; }; g core-loop 'scaled\(360_000\)' 1; g core-loop 'scaled\(180_000\)' 0; g core-loop 'test\.setTimeout\(scaled\(1_320_000 \+ FIRST_LAUNCH_WAIT_MS\)\)' 1; test $f -eq 0   # arrival wait widened, file budget raised by the same 180 s; failing-check count [HEAD=3 EXPECT==0]</automated>
    <automated>test -z "$(rg -l '\.\./e2e/(hyperspace|core-loop)\.spec' tests --glob '!tests/e2e/**')"   # non-e2e guards that read these specs [HEAD=0 EXPECT==0 GUARD MUTATION: a new non-e2e test that reads hyperspace.spec.ts or core-loop.spec.ts by relative URL turns it red]</automated>
    <automated>L=$(git log --format= --name-only --grep='quick-261121-bjl' 20a9942..HEAD) && W=$(git diff --name-only HEAD) && test -z "$(printf '%s\n%s\n' "$L" "$W" | rg -v '^(tests/|\.planning/|$)')"   # out-of-scope file count in this task's commits and uncommitted edits [HEAD=0 EXPECT==0 GUARD MUTATION: an edit under src/ or to playwright.config.ts turns it red]</automated>
  </verify>
  <done>hyperspace.spec.ts and core-loop.spec.ts follow rows 1 and 2 of the change table exactly; typecheck and lint pass in Docker; the two files are committed.</done>
</task>

<task type="auto">
  <name>Task 2: The five waitForMode-helper specs (autosave, budget, save-load, station-tabs, throttle)</name>
  <files>tests/e2e/autosave.spec.ts, tests/e2e/budget.spec.ts, tests/e2e/save-load.spec.ts, tests/e2e/station-tabs.spec.ts, tests/e2e/throttle.spec.ts</files>
  <read_first>
    - The change table, the budget rule and the guard lesson in this plan's context section
    - Only the regions the table names: autosave.spec.ts 37, 46-50, 84-95, 317-324, 443-451; budget.spec.ts 40-46, 159-170; save-load.spec.ts 19, 41, 114-125, 250-252, 639-643; station-tabs.spec.ts 14-20, 70-76, 390-392, 650-654, 935-939; throttle.spec.ts 18-24, 40-51
  </read_first>
  <action>
    Guard check first: for each timeout literal this task changes, run rg -n -F with the literal over tests with the glob '!tests/e2e/**', and update in this commit any guard that reads one of these five specs (none expected at 20a9942).

    For each of the five files apply its row of the change table: add FIRST_LAUNCH_WAIT_MS to the existing "./helpers/probe.js" import (alphabetical inside the braces); set the waitForMode helper's timeout option to FIRST_LAUNCH_WAIT_MS; set the governing timeouts exactly as the row says. Specifically: autosave gains test.setTimeout(540_000 + FIRST_LAUNCH_WAIT_MS) as the first statement of the test "a tainted manual dock reaches the trigger but skips the write ...", and the trigger-matrix test's 1,200 s budget becomes test.setTimeout(1_140_000 + FIRST_LAUNCH_WAIT_MS) (keep its 75 % comment and add one own-line sentence that the budget now adds the first-launch wait, quick 261121-bjl); reword the file-level comment's last sentence so it says the trigger matrix sets its own budget (1,140 s plus the first-launch wait) instead of 1,200 s. budget.spec.ts's file-level becomes test.setTimeout(240_000 + FIRST_LAUNCH_WAIT_MS). save-load gains test.setTimeout(300_000 + FIRST_LAUNCH_WAIT_MS) as the first statement of "F2 is inert while paused and in flight" and of "an in-session Load of an in-flight save returns to flight with the station hidden". station-tabs gains test.setTimeout(120_000 + FIRST_LAUNCH_WAIT_MS) as the first statement of "the Launch tab launches only from Home", "in flight the chart opens without the station strip" and "the chart and Save/Load headers show the live balance, not the key label". throttle.spec.ts's file-level becomes test.setTimeout(540_000 + FIRST_LAUNCH_WAIT_MS). Keep every file-level value the table says stays.

    Above every new or changed test.setTimeout put a one-line own-line comment: the old N s non-launch budget plus the first-launch wait (quick 261121-bjl), with N from the table. Leave every wait in the "left unchanged" table alone (launchAndAwaitCommit, the launching waits, the commit waits, the Continue and Load waits), and change no assertion, step order or key press.

    Run docker compose run --rm typecheck and docker compose run --rm lint; if Prettier reports a difference, run docker compose run --rm lint npx prettier --write on the touched files only and rerun lint. Commit the five files: test(quick-261121-bjl): give the remaining waitForMode launch waits FIRST_LAUNCH_WAIT_MS.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>fail=0; for e in autosave:3:2:4 budget:1:1:3 save-load:3:2:4 station-tabs:4:3:5 throttle:1:1:3; do IFS=: read -r f st stf flw <<<"$e"; c=$(rg -v '^\s*(\*|//)' "tests/e2e/$f.spec.ts"); a=$(printf '%s\n' "$c" | rg -c 'test\.setTimeout\(' || true); b=$(printf '%s\n' "$c" | rg 'test\.setTimeout\(' | rg -c FIRST_LAUNCH_WAIT_MS || true); d=$(printf '%s\n' "$c" | rg -c FIRST_LAUNCH_WAIT_MS || true); [ "${a:-0}" -eq "$st" ] && [ "${b:-0}" -eq "$stf" ] && [ "${d:-0}" -eq "$flw" ] || { echo "FAIL $f setTimeout=${a:-0} withConst=${b:-0} const=${d:-0}"; fail=1; }; done; test $fail -eq 0   # per file: setTimeout code lines / those using the constant / code lines using the constant; failing-file count [HEAD=5 EXPECT==0]</automated>
    <automated>f=0; g(){ c=$(rg -v '^\s*(\*|//)' "tests/e2e/$1.spec.ts"); n=$(printf '%s\n' "$c" | rg -c "$2" || true); [ "${n:-0}" -eq "$3" ] || { echo "FAIL $1 $2 = ${n:-0}"; f=$((f+1)); }; }; g autosave 'test\.setTimeout\(540_000 \+ FIRST_LAUNCH_WAIT_MS\)' 1; g autosave 'test\.setTimeout\(1_140_000 \+ FIRST_LAUNCH_WAIT_MS\)' 1; g autosave 'test\.setTimeout\(600_000\)' 1; g budget 'test\.setTimeout\(240_000 \+ FIRST_LAUNCH_WAIT_MS\)' 1; g save-load 'test\.setTimeout\(300_000 \+ FIRST_LAUNCH_WAIT_MS\)' 2; g save-load 'test\.setTimeout\(360_000\)' 1; g station-tabs 'test\.setTimeout\(120_000 \+ FIRST_LAUNCH_WAIT_MS\)' 3; g station-tabs 'test\.setTimeout\(180_000\)' 1; g throttle 'test\.setTimeout\(540_000 \+ FIRST_LAUNCH_WAIT_MS\)' 1; test $f -eq 0   # exact budget expressions and kept file-level values; failing-check count [HEAD=6 EXPECT==0]</automated>
    <automated>f=0; g(){ c=$(rg -v '^\s*(\*|//)' "tests/e2e/$1.spec.ts"); n=$(printf '%s\n' "$c" | rg -c "$2" || true); [ "${n:-0}" -eq "$3" ] || { echo "FAIL $1 $2 = ${n:-0}"; f=$((f+1)); }; }; g autosave 'test\.setTimeout\(1_200_000\)' 0; g autosave 'timeout: 90_000' 1; test $f -eq 0   # old matrix budget gone; launchAndAwaitCommit keeps 90 s; failing-check count [HEAD=1 EXPECT==0]</automated>
    <automated>test -z "$(rg -l '\.\./e2e/(autosave|budget|save-load|station-tabs|throttle)\.spec' tests --glob '!tests/e2e/**')"   # non-e2e guards that read these specs [HEAD=0 EXPECT==0 GUARD MUTATION: a new non-e2e test that reads one of these five specs by relative URL turns it red]</automated>
    <automated>L=$(git log --format= --name-only --grep='quick-261121-bjl' 20a9942..HEAD) && W=$(git diff --name-only HEAD) && test -z "$(printf '%s\n%s\n' "$L" "$W" | rg -v '^(tests/|\.planning/|$)')"   # out-of-scope file count [HEAD=0 EXPECT==0 GUARD MUTATION: an edit under src/ turns it red]</automated>
  </verify>
  <done>The five files follow their table rows exactly; every changed governing timeout is the rule's expression; typecheck and lint pass in Docker; the five files are committed.</done>
</task>

<task type="auto">
  <name>Task 3: The two-launch tests in settings and station, the full unit suite, the remote run and the todo</name>
  <files>tests/e2e/settings.spec.ts, tests/e2e/station.spec.ts, .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md</files>
  <read_first>
    - The change table, both context tables and the guard lesson in this plan's context section
    - tests/e2e/settings.spec.ts lines 491-547; tests/e2e/station.spec.ts lines 15-24 and 857-861, 1018-1060
    - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md (the whole file; match the 2026-11-20 section's style)
  </read_first>
  <action>
    Spec edits (rows 8 and 9 of the change table), after the same rg guard check for each literal changed. settings.spec.ts, test "the Show FPS toggle shows a live counter in flight and docked, persists and resets": set the second launch's in-flight wait timeout to FIRST_LAUNCH_WAIT_MS, and its budget to test.setTimeout(120_000 + 2 * FIRST_LAUNCH_WAIT_MS); rewrite the comment above the budget: the 120 s non-launch budget plus two launch waits, because the launch after the reload also plays in full (launchSeen only enables the skip key) (quick 261121-bjl). station.spec.ts, test "the whole station computer is keyboard-only, and every accepted action writes once": set both in-flight waits (after the first Digit1 and after the reload's Digit1) to FIRST_LAUNCH_WAIT_MS, add test.setTimeout(60_000 + 2 * FIRST_LAUNCH_WAIT_MS) as the first statement with a one-line own-line comment (the old 180 s file budget minus two 60 s launch waits plus two launch waits, quick 261121-bjl); leave the save wait between them, the Shift+C dock wait and the file-level 180 s unchanged. FIRST_LAUNCH_WAIT_MS is already imported in both files.

    Run docker compose run --rm typecheck, docker compose run --rm lint (Prettier fix as in Task 2 if needed) and then the full unit suite docker compose run --rm test. If the unit suite fails on a guard that pins a literal changed in Task 1, 2 or 3, update the guard so it pins the new expression and still rejects a shortened timeout, and include it in this commit; report any other failure. Commit the two specs (and any guard fix): test(quick-261121-bjl): give the second unskipped launches in settings and station FIRST_LAUNCH_WAIT_MS.

    Remote run: confirm git status is clean for tracked files and HEAD holds the Task 1 to 3 commits, then run the nine changed specs once in Chromium on the remote machine with the first verify command (it can take about 10 minutes; use the Bash tool's 600000 ms timeout or run it in the background). A failure caused by an edit of this plan (import, syntax, wrong argument) must be fixed, committed and the run repeated; a failure at a wait this plan did not change, or an assertion failure, is reported in the SUMMARY and to the orchestrator, not fixed by widening scope.

    Todo: append a section headed exactly "## Status (2026-11-21, quick task 261121-bjl)" after the 2026-11-20 section, same bullet style, in English: (1) the run: main CI run 44812771006 at 20a9942, shard 2 took 16.4 min against about 10 for the others; hyperspace.spec.ts:196 and :614 timed out in waitForMode (60 s) after the first launch, missed by 261120-ryc because that file passed on run 44796363344; core-loop.spec.ts:269 timed out in the 180 s arrival wait after the 15 s countdown (frame-bound, at least 360 rendered frames); (2) the fix, one short line per file with its new waits and budgets from the change table (including station-tabs, found by the planner's sweep, and the two-launch reasoning for settings and station); (3) the waits left unchanged, one line each with the reason from the second context table; (4) the remote result: the snapshot SHA, pass and fail counts and the elapsed time the script prints; (5) the watch continues: after the next sharded CI run, re-measure each launch-spanning test's share of its budget per shard and apply the Rule. Add the changed spec files not yet in the front-matter files list. Keep the file in .planning/todos/pending and do not change its earlier sections. Commit the todo: docs(quick-261121-bjl): record the remaining first-launch waits in the CI timeout todo.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint && docker compose run --rm test   # before the spec commit</automated>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/hyperspace.spec.ts tests/e2e/core-loop.spec.ts tests/e2e/autosave.spec.ts tests/e2e/budget.spec.ts tests/e2e/save-load.spec.ts tests/e2e/station-tabs.spec.ts tests/e2e/throttle.spec.ts tests/e2e/settings.spec.ts tests/e2e/station.spec.ts --project=chromium"   # after the spec commit</automated>
    <automated>fail=0; for e in settings:7:7:10 station:4:3:8; do IFS=: read -r f st stf flw <<<"$e"; c=$(rg -v '^\s*(\*|//)' "tests/e2e/$f.spec.ts"); a=$(printf '%s\n' "$c" | rg -c 'test\.setTimeout\(' || true); b=$(printf '%s\n' "$c" | rg 'test\.setTimeout\(' | rg -c FIRST_LAUNCH_WAIT_MS || true); d=$(printf '%s\n' "$c" | rg -c FIRST_LAUNCH_WAIT_MS || true); [ "${a:-0}" -eq "$st" ] && [ "${b:-0}" -eq "$stf" ] && [ "${d:-0}" -eq "$flw" ] || { echo "FAIL $f setTimeout=${a:-0} withConst=${b:-0} const=${d:-0}"; fail=1; }; done; test $fail -eq 0   # failing-file count [HEAD=2 EXPECT==0]</automated>
    <automated>f=0; g(){ c=$(rg -v '^\s*(\*|//)' "tests/e2e/$1.spec.ts"); n=$(printf '%s\n' "$c" | rg -c "$2" || true); [ "${n:-0}" -eq "$3" ] || { echo "FAIL $1 $2 = ${n:-0}"; f=$((f+1)); }; }; g settings 'test\.setTimeout\(120_000 \+ 2 \* FIRST_LAUNCH_WAIT_MS\)' 2; g settings 'test\.setTimeout\(180_000 \+ FIRST_LAUNCH_WAIT_MS\)' 0; g station 'test\.setTimeout\(60_000 \+ 2 \* FIRST_LAUNCH_WAIT_MS\)' 1; g station 'timeout: FIRST_LAUNCH_WAIT_MS' 4; g station 'test\.setTimeout\(180_000\)' 1; test $f -eq 0   # two-launch budgets, both launch waits per test, kept station file budget; failing-check count [HEAD=4 EXPECT==0]</automated>
    <automated>T=.planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md; f=0; [ "$(rg -c '^## Status \(2026-11-21, quick task 261121-bjl\)' $T || echo 0)" -eq 1 ] || f=$((f+1)); [ "$(rg -c '44812771006' $T || echo 0)" -ge 1 ] || f=$((f+1)); [ "$(rg -c '^## Status \(2026-11-20, quick task 261120-ryc\)' $T || echo 0)" -eq 1 ] || f=$((f+1)); [ ! -e .planning/todos/done/2026-11-16-ci-e2e-timeout-margins.md ] || f=$((f+1)); test $f -eq 0   # new section, run id, earlier section kept, still pending; failing-check count [HEAD=2 EXPECT==0 GUARD MUTATION: deleting the 2026-11-20 section or moving the todo to done turns it red]</automated>
    <automated>L=$(git log --format= --name-only --grep='quick-261121-bjl' 20a9942..HEAD) && W=$(git diff --name-only HEAD) && test -z "$(printf '%s\n%s\n' "$L" "$W" | rg -v '^(tests/|\.planning/|$)')"   # out-of-scope file count [HEAD=0 EXPECT==0 GUARD MUTATION: an edit under src/ turns it red]</automated>
    <automated>S=$(git status --porcelain --untracked-files=all) && test -z "$(printf '%s\n' "$S" | rg '^\?\? ' | rg -v '261121-bjl')"   # untracked stray scratch file count [HEAD=0 EXPECT==0 GUARD MUTATION: an untracked scratch spec under tests/e2e/ turns it red]</automated>
  </verify>
  <done>settings and station follow rows 8 and 9; lint, typecheck and the full unit suite pass in Docker before the last commit; the nine changed specs pass in Chromium on the remote machine at the committed HEAD (or an unrelated failure is reported with its cause); the todo carries the 2026-11-21 section, stays pending and is committed.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Test-only change to Playwright wait ceilings and test timeouts; no product code, input handling, persistence, CSP or network-guard change and no new dependency. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261121-01 | Tampering | tests/e2e assertions and the frozen-contract guards | low | mitigate | The scope guard limits this task's commits and uncommitted edits to tests/ and .planning/; the plan forbids changing assertions, expected values, the launch path, skip keys or launchSeen seeding; the per-literal rg check and the full unit suite catch a guard that pins a changed literal, and any guard update must still reject a shortened timeout. |
| T-261121-02 | Denial of service | CI wall time on failure | low | accept | A hung test now fails later (for example core-loop at 1,500 s instead of 1,320 s); the inner waits still fail first with a specific message, and the four shards run in parallel. |
| T-261121-SC | Tampering | npm/pip/cargo installs | low | accept | No package is installed or changed; package.json and package-lock.json are untouched (covered by the scope guard). |
</threat_model>

<verification>
- docker compose run --rm typecheck and docker compose run --rm lint pass after each task; the full unit suite docker compose run --rm test passes before the last commit.
- The per-file gate loops report no FAIL line; the exact-expression gates pass in all three tasks.
- The nine changed spec files pass in Chromium on the remote machine against the committed HEAD.
- The files in this task's commits (subject tag quick-261121-bjl, since 20a9942) and any uncommitted edit are only tests/ and .planning/ paths.
- The todo has the 2026-11-21 status section and is still under .planning/todos/pending.
- No CHANGELOG entry and no verify or verify-full run: internal test-only change. The real proof is the next sharded GitHub CI run, which the owner triggers by pushing.
</verification>

<success_criteria>
- Every e2e wait that spans an unskipped real-time launch uses FIRST_LAUNCH_WAIT_MS, and every timeout that governs such a wait follows the budget rule as a code expression; nothing is lowered.
- The core-loop arrival wait matches the 360 s of the other frame-bound arrivals, and its file budget rises by the same 180 s.
- Each launch-adjacent wait left unchanged is listed with its reason.
- No product code, launch behaviour or assertion changes; nothing is pushed or tagged.
- The CI timeout todo records the run, the fix, the unchanged waits and the remote result, and stays pending.
</success_criteria>

<output>
Create `.planning/quick/261121-bjl-give-the-remaining-first-launch-e2e-wait/261121-bjl-SUMMARY.md` when done
</output>
