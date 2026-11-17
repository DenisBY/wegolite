---
phase: quick
plan: 261117-mng
type: execute
wave: 1
depends_on: []
files_modified:
  - tools/oolite-reference/Dockerfile
  - tools/oolite-reference/entrypoint.sh
  - tools/oolite-reference/run-remote.sh
  - tools/oolite-reference/README.md
  - .planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md
autonomous: true
requirements: [OD-1, OD-2, OD-3, OD-4, OD-5, OD-6, OD-7]

estimate:
  tokens: 90000
  raw_tokens: 90000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "run-remote.sh runs with pipefail, so a failed stage in the sync, add-on or fetch pipeline is no longer masked by a successful last stage (OD-1)."
    - "A failed `mkdir -p` of the output directory or a failed fetch pipeline makes run-remote.sh exit 70, keeps the remote session directory, and prints `fetch failed; remote outputs kept at HOST:PATH` on its own stderr line. A successful fetch still deletes the remote session directory (OD-2)."
    - "Step timeouts (`window`, `sleep`, `waitlog`) and OOREF_TIMEOUT accept only `^[1-9][0-9]{0,4}$`: `window 0`, `sleep 0` and `OOREF_TIMEOUT=08` exit 2 before Oolite starts, and `--timeout 08` or `--timeout 0` exit 64 before any ssh (OD-3)."
    - "The container runs under a unique `--name` inside `timeout $((TIMEOUT + 120)) ssh -n`, and the wrapper runs `docker rm -f` on that name whenever the run returns 124 (OD-3)."
    - "A `key` step whose xdotool call exits non-zero or prints `No such key name` fails the session with exit 1, writes a `key KEYSYM FAILED rc=N` line to session.txt, and still fetches the outputs (OD-4)."
    - "Each `waitlog` searches only the lines after the line that the previous successful `waitlog` matched. A line that satisfied one `waitlog` never satisfies a later one, and the log is checked one last time after Oolite exits (OD-5)."
    - "The Dockerfile sets the Oolite version and the AppImage SHA256 once each, as global ARGs. It builds the release URL from OOLITE_VERSION and keeps `sha256sum -c`, and the bare debug listing is gone. The rebuilt image prints `oolite.AppImage: OK` and records the pinned version and SHA in session.txt (OD-6)."
    - "The README documents the real exit codes, `snapshots/`, `-it` on the debug command, the save directory, running one session at a time, and the waitlog semantics. entrypoint.sh carries the IN-01 comment: termination relies on the `--init` teardown (OD-7)."
    - "With the hardened tool, the shipped steps/title.steps and steps/docked.steps (with the throwaway smoke OXP) still exit 0 with their screenshots. Nothing Oolite-derived is committed, and the 261117-mng commits touch only this plan's files."
  artifacts:
    - path: "tools/oolite-reference/run-remote.sh"
      provides: "pipefail, a bounded --timeout, a named container under an outer timeout, docker rm -f on 124, and a fetch that exits 70 on failure and keeps the remote session"
      contains: "timeout $((TIMEOUT + 120)) ssh -n"
    - path: "tools/oolite-reference/entrypoint.sh"
      provides: "Bounded step and deadline validators, a key step that checks xdotool, a waitlog with a consumed-line cursor (LOG_LINE), and the IN-01 comment"
      contains: "No such key name"
    - path: "tools/oolite-reference/Dockerfile"
      provides: "One global OOLITE_VERSION and APPIMAGE_SHA256, the URL built from the version, and sha256sum -c kept"
      contains: "releases/download/${OOLITE_VERSION}/Oolite-${OOLITE_VERSION}-deployment-x86_64.AppImage"
    - path: "tools/oolite-reference/README.md"
      provides: "An exit-code list matching the scripts, snapshots/, the -it debug command, the save dir, one run at a time, and the waitlog semantics"
      contains: "one run at a time"
    - path: ".planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md"
      provides: "The Opus code review that this task acts on, committed and no longer untracked"
      contains: "WR-07"
  key_links:
    - from: "tools/oolite-reference/run-remote.sh"
      to: "tools/oolite-reference/entrypoint.sh"
      via: "The --timeout value becomes OOREF_TIMEOUT. Both sides validate it with the same bounded pattern, and the wrapper's outer timeout is that value + 120 s"
      pattern: "\\[1-9\\]\\[0-9\\]\\{0,4\\}"
    - from: "tools/oolite-reference/Dockerfile"
      to: "tools/oolite-reference/entrypoint.sh"
      via: "The global ARGs OOLITE_VERSION and APPIMAGE_SHA256 reach session.txt through ENV OOREF_OOLITE_VERSION and OOREF_APPIMAGE_SHA256"
      pattern: "OOREF_OOLITE_VERSION"
    - from: "tools/oolite-reference/README.md"
      to: "tools/oolite-reference/run-remote.sh"
      via: "The README exit-code list (0, 1, 2, 64, 70, 124, 125, 255) matches the header comments in run-remote.sh and entrypoint.sh"
      pattern: "^- `(0|1|2|64|70|124|125|255)`: "
---

<objective>
Harden the headless Oolite reference tool (`tools/oolite-reference/`) against the two code reviews of quick task 261117-iuw. Fix exactly the subset the owner agreed on 2026-11-17 and nothing else.

Purpose: callers treat this tool's exit code and fetched outputs as measurement evidence. Today it can report success after a lost fetch or a mistyped key, match a stale log line, or hang past its deadline. This task closes those false successes and the unbounded hang.

Output: a hardened `run-remote.sh`, `entrypoint.sh` and `Dockerfile`; a README that matches them; the Opus review committed; and evidence runs under `/tmp/ooref-mng/`, outside the repository.

This quick task has no REQUIREMENTS.md IDs. The `requirements` IDs are the owner's locked decisions below.

## Owner decisions (locked, 2026-11-17). Implement exactly these.

- **OD-1**: `set -o pipefail` in run-remote.sh (the pipefail part of WR-04).
- **OD-2** (WR-03): a failed fetch exits non-zero (70) and keeps the remote session directory; check `mkdir -p "$OUT"`.
- **OD-3** (WR-01 minimal): the step validators accept only `^[1-9][0-9]*$` with a bounded digit count for the window, sleep and waitlog timeouts and for OOREF_TIMEOUT / `--timeout`, which also closes the IN-02 octal problem. Give the container a `--name`. Wrap the ssh `docker run` in an outer `timeout $((TIMEOUT+120))`, and `docker rm -f` the named container if that timeout fires.
- **OD-4** (WR-08): `key` checks xdotool's exit status and its "No such key name" output, and fails the step.
- **OD-5** (WR-07): `waitlog` tracks a consumed line offset, so it matches only lines after the previous waitlog's match (a clear, documented semantic), and does one last check after Oolite exits.
- **OD-6** (IN-04): build the AppImage URL from OOLITE_VERSION (one source of the version) and drop the unused ARG and the leftover debug listing. Keep the SHA256 pin and the `sha256sum -c` check.
- **OD-7**: the README states the real exit codes: 124 only between steps, a deadline inside window or waitlog gives 1, and 125 (docker) and 255 (ssh) are listed. It also covers `snapshots/`, `-it` on the debug command, the save dir, "one run at a time" and the waitlog semantics. IN-01 becomes a comment only: termination relies on the `--init` teardown.

## Skipped by owner decision (OD-S). Do NOT implement any of these.

WR-02 cleanup trap, WR-05 concurrency (lock or unique sync directory), WR-04 add-on name arrays, IN-03, IN-05, IN-06, IN-07 (the only exception is `ssh -n` on the two calls OD-3 needs, see Task 1), IN-08, IN-10, an entrypoint TERM/INT trap, an in-repo `--addons` guard, tar-path validation, and AppImage ARG override hardening. WR-06's capped-step 124 logic is also out: OD-7 documents the real behaviour instead. Leave the `windowfocus` calls unchanged; OD-4 covers only the key send.

Design choices left to the planner, with the reasons:

- Digit bound `{0,4}`, so values run from 1 to 99999. That is about 27 hours, far above any session, and well below bash integer overflow.
- A fetch failure overrides the container's exit code with 70, so exit 70 always means "the outputs are not (all) here". The container's code is still printed on the last line (`container_exit=`) and in wrapper.txt.
- The waitlog cursor counts lines, not bytes, and moves to the matched line on success. The alternative, "only lines written after this step started", would race with Oolite's 2 s asynchronous log flush: a line logged in response to the previous `key` could be flushed just before the wait begins and be missed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@.planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md
@.planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-SUMMARY.md
@tools/oolite-reference/Dockerfile
@tools/oolite-reference/entrypoint.sh
@tools/oolite-reference/run-remote.sh
@tools/oolite-reference/README.md
@tools/oolite-reference/steps/title.steps
@tools/oolite-reference/steps/docked.steps

The GPT review via opencode is outside the repository, at /home/opencode/.claude/jobs/84a5c1eb/tmp/opencode-review.md. Every point of it that the owner kept is already in OD-1..OD-7 above.

Reviewer and subagent brief (quoted from AGENTS.md):

- **Tests and builds run in Docker only.** Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test <spec>"` (browser), `docker compose run --rm e2e-cross` (Firefox browser tests, outside verify), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.

Working rules for the executor:

- Use the codebase-memory MCP index (project `wegolite`) before grepping when you explore code. The files here are shell, a Dockerfile and Markdown, so reading them directly is expected. Prefer `rg` over `grep`.
- If you need upstream Oolite behaviour, use the checkout at /home/opencode/git/oolite (for example `ShellScripts/Linux/run_oolite.sh`). Never fetch Oolite files over the network, and never clone another copy.
- Another quick task (261117-mne: src/sim/flight/torus.ts and related files) shares this working tree. Stage ONLY this plan's files, by explicit path. Never use `git add -A`, `git add .` or `git commit -a`. Do not touch src/, tests/, FIDELITY.md, CHANGELOG.md, compose.yaml or `.planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md`. Do not push or tag.
- Gates: no `verify`, `verify-full` or e2e. The only repository gates are `tests/compliance.test.ts` and `prettier --check` on the README, run on the remote machine through /home/opencode/.claude/scripts/wegolite-remote-run.sh after committing (Task 3).
- Reference sessions run sequentially, never two at once (WR-05 is skipped by decision). entrypoint.sh is baked into the image, so the first run after any entrypoint.sh or Dockerfile edit must NOT pass `--no-build`.
- Scratch and evidence go under /tmp/ooref-mng/ (call it W). If W exists from an earlier attempt, run `chmod -R u+w /tmp/ooref-mng && rm -rf /tmp/ooref-mng` and create it again, because run-remote.sh refuses a non-empty `--out`. Capture every run as `<cmd> >"$W/<name>.out" 2>&1; echo $? >"$W/<name>.rc"`.
</context>

<tasks>

<task type="tracer">
  <name>Task 1 (tracer): bounded deadline, named container under an outer timeout, and an honest fetch, proven end-to-end through a rebuilt image</name>
  <files>tools/oolite-reference/Dockerfile, tools/oolite-reference/run-remote.sh, tools/oolite-reference/entrypoint.sh</files>
  <read_first>tools/oolite-reference/run-remote.sh (whole file), tools/oolite-reference/Dockerfile (whole file), tools/oolite-reference/entrypoint.sh lines 1-90 (validator), .planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md sections WR-01, WR-03, WR-04, WR-06, IN-02 and IN-04</read_first>
  <precondition>`ssh -o BatchMode=yes opencode@192.168.178.51 docker version` succeeds, because the remote test machine and its Docker are reachable without a password.</precondition>
  <action>
Dockerfile (per OD-6):
- Directly after the header comments and before the first FROM, declare two global build arguments: `ARG OOLITE_VERSION=1.93.1-255` and `ARG APPIMAGE_SHA256=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8`. These become the only non-comment lines in the file that carry the version string and the AppImage digest. Keep `# syntax=docker/dockerfile:1` as line 1, because a parser directive must come first.
- In the fetch stage, replace its three ARG lines with a bare `ARG OOLITE_VERSION` and a bare `ARG APPIMAGE_SHA256`, without values. A global ARG has to be re-declared inside a stage to be visible there (Docker reference, "Understand how ARG and FROM interact"). Remove the ARG that holds the hard-coded release URL.
- Have the curl in the fetch RUN download `https://github.com/OoliteProject/oolite/releases/download/${OOLITE_VERSION}/Oolite-${OOLITE_VERSION}-deployment-x86_64.AppImage`. Write it with braces, exactly in that form.
- Keep the `echo "$APPIMAGE_SHA256  oolite.AppImage" | sha256sum -c -` check exactly as it is.
- Delete the bare listing step that sits between the AppImage extraction and the `mv squashfs-root` line.
- In the runtime stage, replace the two valued ARG lines with a bare `ARG OOLITE_VERSION` and a bare `ARG APPIMAGE_SHA256`. The ENV lines OOREF_OOLITE_VERSION and OOREF_APPIMAGE_SHA256 stay as they are.
- Update the header comment that describes the pin. It should say that the version is set once (the global ARG OOLITE_VERSION), that the release URL is built from it, and that the download is checked against the pinned APPIMAGE_SHA256 with `sha256sum -c`, where a mismatch fails the build.
- Change nothing else: not the base digests, the apt package lists, the user setup or the ENV block. The fetch RUN text changes, so the next build downloads the 278 MB AppImage again.

entrypoint.sh, validator only (per OD-3):
- Replace the unbounded digit patterns with `^[1-9][0-9]{0,4}$` in the OOREF_TIMEOUT check, the optional `window` timeout, the `sleep` seconds and the `waitlog` timeout. That is four places.
- Reword their die_usage messages to say "an integer from 1 to 99999". For example: "OOREF_TIMEOUT must be an integer from 1 to 99999".
- This rejects 0 (GNU `timeout 0` disables the timeout), leading zeros (bash reads `08` as an invalid octal number) and numbers long enough to overflow the `[ -gt ]` cap.
- Change nothing else in entrypoint.sh in this task. Task 2 handles key, waitlog and the header.

run-remote.sh:
- (OD-1) Change `set -u` to `set -uo pipefail`. Do not add `-e`: the script checks each step itself.
- (OD-3) Validate `--timeout` with `^[1-9][0-9]{0,4}$`. On failure, print "--timeout must be an integer from 1 to 99999" to stderr and exit 64. This check stays before any ssh.
- (OD-3) Once SESSION is known, set `NAME="ooref-${SESSION##*/}"`. This is unique per run because it ends in the remote mktemp suffix, and it is a valid Docker name. Prepend `--name $(printf %q "$NAME")` to RUN_ARGS.
- (OD-3) Run the container as `timeout $((TIMEOUT + 120)) ssh -n "$H" "docker run $RUN_ARGS $IMAGE"`, then `RC=$?`. Write it in exactly that form.
  - `-n` is required. Without `--foreground`, GNU timeout runs ssh in a background process group, so an ssh that reads a terminal stdin gets SIGTTIN and stops until the backstop fires. The container needs no stdin.
- (OD-3) If RC is 124, run `ssh -n "$H" "docker rm -f $(printf %q "$NAME")"` with its output discarded and its failure ignored. Print one stderr line saying that the deadline or the outer backstop ended the run and that container NAME was removed if it was still running.
  - The container's own deadline exit also returns 124. The rm is then a harmless no-op on a container that `--rm` already removed.
  - Leave the other ssh calls as they are (IN-07 is skipped).
- (OD-2) Replace the fetch block:
  - Set FETCH=ok. Run `mkdir -p -- "$OUT"`, and set FETCH=failed if it fails.
  - Only if it succeeded, run the existing fetch pipeline (remote `tar -C SESSION/out -cf - .` piped into local `tar -m -x -C "$OUT"`). With pipefail set, any stage failing sets FETCH=failed.
  - Keep the IMAGE_ID lookup.
  - If FETCH=ok, delete the remote session as now.
  - Otherwise do NOT delete it. Print exactly `fetch failed; remote outputs kept at ${H}:${SESSION}` as its own stderr line, followed by a second stderr line with the recovery hint (fetch with ssh tar into an empty local directory, then `rm -rf` the remote path).
  - Set FINAL=$RC, and FINAL=70 when FETCH=failed.
- In wrapper.txt, keep every existing line, add `fetch=$FETCH` after `container_exit`, and add `container=$NAME`. If the redirect into `$OUT/wrapper.txt` fails, report it on stderr; that never changes FINAL.
- Make the last stdout line `exit=$FINAL container_exit=$RC elapsed=${ELAPSED}s out=$OUT` and exit with "$FINAL".
- Update the header comment's exit-code list:
  - the container's code (0, 1, 2, 124, as in entrypoint.sh);
  - 124 also when the outer backstop (`--timeout` + 120 s) fired, after which the named container is removed;
  - 125 when `docker run` itself failed (daemon error, or no image with `--no-build`);
  - 255 when ssh failed during the run;
  - 64 for a usage error, a bad `--timeout` or a refused output directory;
  - 70 for a sync, build, session-setup or fetch failure, where a failed fetch keeps the remote session directory and prints its path.

Evidence runs. Run them sequentially from the repo root, with R=tools/oolite-reference/run-remote.sh, T=tools/oolite-reference and W=/tmp/ooref-mng, and capture each one into "$W/<name>.out" and "$W/<name>.rc" as the context section describes.
- (a) Baseline: `ssh opencode@192.168.178.51 'ls -A ~/oolite-reference-runs 2>/dev/null' >"$W/runs-before.txt"`. Record the current image ID from `ssh opencode@192.168.178.51 docker image inspect --format '{{.Id}}' wegolite-oolite-reference:1.93.1-255` for the SUMMARY.
- (b) title, with a build: `$R --out $W/title --steps $T/steps/title.steps`. Expect rc 0, the line `oolite.AppImage: OK` in title.out, the pinned version and SHA in session.txt, and a 01-title.png over 100 KB. A SHA mismatch is stop-and-report: never re-pin. The download makes this run take several minutes, so run it in the background if needed.
- (c) `OOREF_HOST=nohost.invalid $R --timeout 08 --out $W/t08` and `OOREF_HOST=nohost.invalid $R --timeout 0 --out $W/t0`. Expect rc 64 for both. A 70 here would mean ssh was attempted.
- (d) Write $W/window0.steps containing the single line `window 0`. Write $W/sleep0.steps containing `window 120` and then `sleep 0`. Run `$R --no-build --out $W/window0 --steps $W/window0.steps` and the same for sleep0. Expect rc 2 for both, and no oolite-stdout.log in either output directory, which shows that Oolite never started.
- (e) envtimeout: `ssh opencode@192.168.178.51 'docker run --rm --network none -e OOREF_TIMEOUT=08 wegolite-oolite-reference:1.93.1-255'`. Expect rc 2 and a message naming OOREF_TIMEOUT. This tests the in-container check directly, because the wrapper never forwards a bad value.
- (f) Fetch-failure simulation, chosen to be safe because it only makes a local /tmp directory unwritable:
  - Write $W/short.steps containing `window 120`. Run `mkdir -p $W/ro-out && chmod 555 $W/ro-out`.
  - fetchro: `$R --no-build --out $W/ro-out --steps $W/short.steps`. The directory exists and is empty, so the guard passes; the local `tar -x` then fails. Expect rc 70 and the "remote outputs kept at" line.
  - fetchmk: `$R --no-build --out $W/ro-out/sub --steps $W/short.steps`. Here `mkdir -p` fails. Expect rc 70 and the same line.
  - For each run, take the PATH from that line and check that it starts with the remote home followed by `/oolite-reference-runs/`. Save `ssh opencode@192.168.178.51 cat PATH/out/session.txt` as $W/fetchro.remote-session.txt or $W/fetchmk.remote-session.txt; it should show exit=0. Then remove exactly that PATH on the remote with `rm -rf --`.
  - Afterwards run `chmod 755 $W/ro-out`.
- (g) `ssh opencode@192.168.178.51 'ls -A ~/oolite-reference-runs 2>/dev/null' >"$W/runs-after.txt"`. It must equal runs-before.txt, which shows that every successful fetch still deleted its session.

When the verify passes, commit ONLY tools/oolite-reference/Dockerfile, tools/oolite-reference/run-remote.sh and tools/oolite-reference/entrypoint.sh, by explicit path, as `fix(quick-261117-mng): bound the reference session deadline and fail on a lost fetch`.
  </action>
  <verify>
    <automated>T=tools/oolite-reference; W=/tmp/ooref-mng; D=$T/Dockerfile; E=$T/entrypoint.sh; R=$T/run-remote.sh; SHA=4ec9ab5fc6743538c95b97b590674f5d386dd07c16565aa1389dc40f15bd66a8; KEPT='^fetch failed; remote outputs kept at opencode@192\.168\.178\.51:/[^ ]*/oolite-reference-runs/[^ ]+$'; bash -n "$E" && bash -n "$R" && test "$(rg -v '^\s*#' "$D" | rg -cF '1.93.1-255')" = 1 && test "$(rg -v '^\s*#' "$D" | rg -cF "$SHA")" = 1 && rg -qF 'releases/download/${OOLITE_VERSION}/Oolite-${OOLITE_VERSION}-deployment-x86_64.AppImage' "$D" && test "$(rg -v '^\s*#' "$D" | rg -cF 'sha256sum -c')" = 1 && ! rg -q '^\s*&& ls\s*\\$' "$D" && ! rg -qF '^[0-9]+$' "$E" "$R" && test "$(rg -cF '[1-9][0-9]{0,4}' "$E")" -ge 4 && rg -qF '[1-9][0-9]{0,4}' "$R" && rg -v '^\s*#' "$R" | rg -q 'set -[a-z]*o pipefail' && rg -v '^\s*#' "$R" | rg -qF -- '--name' && rg -qF 'timeout $((TIMEOUT + 120)) ssh -n' "$R" && rg -qF 'docker rm -f' "$R" && test "$(cat $W/title.rc)" = 0 && rg -qF 'oolite.AppImage: OK' $W/title.out && rg -qx 'oolite_version=1\.93\.1-255' $W/title/session.txt && rg -qx "appimage_sha256=$SHA" $W/title/session.txt && rg -qx 'exit=0' $W/title/session.txt && test "$(stat -c %s $W/title/screenshots/01-title.png)" -gt 100000 && rg -qx 'container_exit=0' $W/title/wrapper.txt && rg -qx 'fetch=ok' $W/title/wrapper.txt && test "$(cat $W/t08.rc)" = 64 && test "$(cat $W/t0.rc)" = 64 && test "$(cat $W/window0.rc)" = 2 && test ! -e $W/window0/oolite-stdout.log && test "$(cat $W/sleep0.rc)" = 2 && test ! -e $W/sleep0/oolite-stdout.log && test "$(cat $W/envtimeout.rc)" = 2 && rg -qF OOREF_TIMEOUT $W/envtimeout.out && test "$(cat $W/fetchro.rc)" = 70 && rg -q "$KEPT" $W/fetchro.out && rg -qx 'exit=0' $W/fetchro.remote-session.txt && test "$(cat $W/fetchmk.rc)" = 70 && rg -q "$KEPT" $W/fetchmk.out && rg -qx 'exit=0' $W/fetchmk.remote-session.txt && cmp -s $W/runs-before.txt $W/runs-after.txt  # gates: Dockerfile version lines non-comment [HEAD=3 EXPECT==1]; AppImage SHA lines non-comment [HEAD=2 EXPECT==1]; URL from ${OOLITE_VERSION} [HEAD=0 EXPECT==1]; sha256sum -c non-comment [HEAD=1 EXPECT==1 @a498409 GUARD MUTATION: deleting the sha256sum -c line from the fetch RUN]; debug listing line [HEAD=1 EXPECT==0]; unbounded digit regex in E+R [HEAD=5 EXPECT==0]; bounded regex in E [HEAD=0 EXPECT>=4]; bounded regex in R [HEAD=0 EXPECT>=1]; pipefail non-comment [HEAD=0 EXPECT>=1]; --name non-comment in R [HEAD=0 EXPECT>=1]; outer timeout form [HEAD=0 EXPECT==1]; docker rm -f [HEAD=0 EXPECT>=1]; run evidence files [HEAD=absent EXPECT==present]</automated>
  </verify>
  <done>
- The rebuilt image fetched the AppImage from the URL built from OOLITE_VERSION, passed `sha256sum -c`, and ran the shipped title steps to exit 0 with a real title screenshot.
- Zero, leading-zero and over-long timeouts are refused before Oolite starts (exit 2) or before any ssh (exit 64).
- A lost fetch exits 70, keeps the remote session directory and names its path, while successful runs still clean up.
- The three files are committed by explicit path, and nothing else is staged.
  </done>
</task>

<task type="auto">
  <name>Task 2: key fails on unknown keysyms, and waitlog consumes its matches with a final check after Oolite exits</name>
  <files>tools/oolite-reference/entrypoint.sh</files>
  <read_first>tools/oolite-reference/entrypoint.sh (whole file, as left by Task 1), .planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md sections WR-07, WR-08 and IN-01, /home/opencode/git/oolite/ShellScripts/Linux/run_oolite.sh around line 110 (the launcher runs the oolite binary as a child)</read_first>
  <precondition>/tmp/oolite-ref-smoke/addons/wegolite-smoke.oxp/Config/script.js exists. If it is missing, recreate it as a world script with "use strict", this.name = "wegolite-smoke", this.author = "Wegolite", this.version = "0.0.1", and a this.startUp that calls log(this.name, "wegolite-smoke: hello from startUp").</precondition>
  <action>
entrypoint.sh, `key` step (per OD-4):
- For each keysym, keep the same hold sequence: keydown, 0.5 s, keyup, 0.3 s. Capture xdotool's stderr into a variable with stdout discarded, and take xdotool's exit status as krc, the status of the command substitution.
- The step fails when krc is non-zero or the captured stderr contains the fixed string `No such key name`. xdotool 3.20160805 prints that string for an unknown keysym, ignores the key and may still exit 0, which is why the exit status alone is not enough.
- On failure, append `step $idx: key $ks FAILED rc=$krc` to STEP_REPORT and call `fail 1` with a message of the form "xdotool could not send key '$ks' (rc=$krc): " followed by the first line of the captured stderr. fail() already writes that message to session.txt as an `error:` line.
- Only after every keysym succeeds, append the existing `step $idx: key $arg ok` line.
- Leave both `windowfocus` calls unchanged. They are outside OD-4.

entrypoint.sh, `waitlog` step (per OD-5). The semantic is a consumed-line cursor:
- Add a global `LOG_LINE=0` next to SHOT_SEQ, with a comment: the number of Latest.log lines consumed by earlier successful waitlog steps.
- Add a helper `log_match TEXT` before the step loop:
  - if $LOG exists, stream the lines after line LOG_LINE (`tail -n +$((LOG_LINE + 1))`) into `grep -anF -m1 -- TEXT`;
  - take the leading line number of the first hit, which is relative to the tail, and add it to LOG_LINE;
  - return 0 on a hit and 1 otherwise.
  The cursor counts lines, so a hit on a partly flushed last line still lands on the right line number.
- Rewrite the waitlog case:
  - Cap wt to left as now and compute a deadline epoch of now + wt.
  - Loop:
    - If log_match hits, set found=1 and break.
    - If `kill -0 $OOLITE_PID` fails, note that Oolite exited, run log_match one more time (found=1 on a hit) and break.
    - If the clock has reached the deadline, break.
    - Otherwise sleep 1.
  - On success, append `step $idx: waitlog ok line=$LOG_LINE`.
  - On failure, keep the existing `waitlog FAILED text=...` report line and `fail 1`. The message should say whether Oolite exited or the wait ran out after wt seconds.
- The old whole-file grep must be gone.
- Effect: a line that satisfied one waitlog never satisfies a later one, a marker logged twice satisfies two waitlogs, and a line flushed before the step began still counts if no earlier waitlog consumed it.

entrypoint.sh comments:
- (IN-01, per OD-7, comment only, no code change) Directly above the kill sequence in shutdown_all, add a comment:
  - OOLITE_PID is the AppImage launcher shell, which runs the oolite binary as a child (run_oolite.sh does not exec it);
  - so the TERM and KILL here reach the launcher only;
  - the oolite process ends when the container is torn down, which relies on `docker run --init` (run-remote.sh always passes it).
- Update the header exit-code comment to the real behaviour:
  - 0 ok, including when a last `sleep` is cut short by the deadline;
  - 1 a step failed or Oolite died, including a `window` or `waitlog` that runs out of the overall deadline, and a key xdotool could not send;
  - 2 a bad steps file or OOREF_TIMEOUT, refused before Oolite starts;
  - 124 the overall deadline was found expired before a step.

Evidence runs. Run them sequentially with W=/tmp/ooref-mng, R=tools/oolite-reference/run-remote.sh and T=tools/oolite-reference, capturing .out and .rc as before. The first run rebuilds, because the entrypoint changed.
- docked: `$R --out $W/docked --steps $T/steps/docked.steps --addons /tmp/oolite-ref-smoke/addons`. Expect rc 0, two `key Return ok` lines and three screenshots over 100 KB. Read $W/docked/screenshots/03-docked.png and confirm it shows the docked status screen (Commander Jameson, Lave, Docked).
- badkey: write $W/badkey.steps with the lines `window 120`, `sleep 5` and `key Retrun`, and run it with `--no-build`. Expect rc 1 and `step 3: key Retrun FAILED rc=N`. Record the exact xdotool stderr line and rc in the SUMMARY, as evidence of which signal fired.
- never: `$R --no-build --out $W/never --steps /tmp/oolite-ref-smoke/never.steps`. That file holds `window 120` and `waitlog 5 this line never appears`; recreate it if missing. Expect rc 1, a non-empty fetched logs/Latest.log and wrapper.txt `fetch=ok`.
- consume:
  - Write the throwaway OXP /tmp/ooref-mng/addons/wegolite-mng.oxp/Config/script.js: "use strict", name "wegolite-mng", author "Wegolite", version "0.0.1", and a startUp that calls log(this.name, ...) three times, with "MNG hello", "MNG twice a" and "MNG twice b". The two "twice" lines differ in their suffix, so no logger collapses them as a repeat.
  - Write $W/consume.steps with the lines `window 120`, `waitlog 60 MNG hello`, `waitlog 10 MNG twice`, `waitlog 10 MNG twice` and `waitlog 5 MNG twice`.
  - Run `$R --no-build --out $W/consume --steps $W/consume.steps --addons /tmp/ooref-mng/addons`.
  - Expect rc 1, steps 2-4 `waitlog ok line=N` with strictly increasing N, step 5 FAILED, and exactly two "MNG twice" lines in the fetched Latest.log. Before this task, step 5 would have matched a stale line.
- Run `ssh opencode@192.168.178.51 'ls -A ~/oolite-reference-runs 2>/dev/null' >"$W/runs-after2.txt"`. It must equal runs-before.txt.
- Optional disk hygiene: `docker rmi` only the exact superseded image IDs you recorded (the pre-Task-1 ID, and the Task-1 ID if this rebuild replaced it). Never run a global prune, because the gate's images live on the same daemon.

When the verify passes, commit ONLY tools/oolite-reference/entrypoint.sh, by explicit path, as `fix(quick-261117-mng): fail on unknown keys and consume waitlog matches`.
  </action>
  <verify>
    <automated>T=tools/oolite-reference; W=/tmp/ooref-mng; E=$T/entrypoint.sh; bash -n "$E" && rg -qF 'No such key name' "$E" && test "$(rg -cF 'LOG_LINE' "$E")" -ge 3 && ! rg -qF 'grep -qF -- "$wtext" "$LOG"' "$E" && rg -qF -- '--init' "$E" && test "$(cat $W/docked.rc)" = 0 && test "$(rg -c '^step [0-9]+: key Return ok$' $W/docked/session.txt)" = 2 && rg -qx 'exit=0' $W/docked/session.txt && test "$(stat -c %s $W/docked/screenshots/01-title.png)" -gt 100000 && test "$(stat -c %s $W/docked/screenshots/02-scenarios.png)" -gt 100000 && test "$(stat -c %s $W/docked/screenshots/03-docked.png)" -gt 100000 && rg -qF 'wegolite-smoke: hello from startUp' $W/docked/logs/Latest.log && test "$(cat $W/badkey.rc)" = 1 && rg -q '^step 3: key Retrun FAILED rc=[0-9]+$' $W/badkey/session.txt && rg -q '^error: .*Retrun' $W/badkey/session.txt && rg -qx 'exit=1' $W/badkey/session.txt && test "$(cat $W/never.rc)" = 1 && test -s $W/never/logs/Latest.log && rg -q '^step 2: waitlog FAILED' $W/never/session.txt && rg -qx 'container_exit=1' $W/never/wrapper.txt && rg -qx 'fetch=ok' $W/never/wrapper.txt && test "$(cat $W/consume.rc)" = 1 && test "$(rg -c '^step [234]: waitlog ok line=[0-9]+$' $W/consume/session.txt)" = 3 && rg -q '^step 5: waitlog FAILED' $W/consume/session.txt && test "$(rg -cF 'MNG twice' $W/consume/logs/Latest.log)" = 2 && cmp -s $W/runs-before.txt $W/runs-after2.txt  # gates: No such key name check [HEAD=0 EXPECT>=1]; LOG_LINE cursor [HEAD=0 EXPECT>=3]; whole-file waitlog grep [HEAD=1 EXPECT==0]; IN-01 --init comment [HEAD=0 EXPECT>=1]; docked key ok lines [HEAD=absent EXPECT==2]; badkey FAILED line [HEAD=absent EXPECT==1]; consume ok lines [HEAD=absent EXPECT==3]; consume step 5 FAILED [HEAD=absent EXPECT==1]; MNG twice lines in log [HEAD=absent EXPECT==2]</automated>
  </verify>
  <done>
- The shipped docked steps still reach the docked status screen with the smoke OXP loaded.
- A mistyped keysym fails the session with exit 1 and a FAILED line.
- A never-matching waitlog exits 1 and still fetches Latest.log.
- A marker that an earlier waitlog consumed no longer satisfies a later waitlog.
- entrypoint.sh carries the IN-01 comment and a truthful exit-code header, and it is committed by explicit path.
  </done>
</task>

<task type="auto">
  <name>Task 3: README matches the hardened tool, the review is committed, and the remote compliance and prettier gates pass</name>
  <files>tools/oolite-reference/README.md, .planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md</files>
  <read_first>tools/oolite-reference/README.md (whole file), the final tools/oolite-reference/run-remote.sh and tools/oolite-reference/entrypoint.sh header comments (the exit codes must match them word for word in meaning)</read_first>
  <action>
README edits (per OD-7). Keep the existing structure and the house style (English, short sentences).

- Exit codes: replace the exit-code paragraph in the Usage section with a bullet list. It has exactly one bullet per code, each starting with the code in backticks followed by a colon, in this order:
  - `0`: ok, including when a last `sleep` is cut short by the deadline.
  - `1`: a step failed or Oolite died. This includes a `window` or `waitlog` that runs out of the overall deadline (the step is capped to the remaining time and fails as a step) and a key xdotool could not send. The outputs are still fetched.
  - `2`: a bad steps file or OOREF_TIMEOUT, refused before Oolite starts.
  - `64`: a usage error, a bad `--timeout` or a refused output directory, before any ssh.
  - `70`: a sync, build, session-setup or fetch failure. A failed fetch overrides the container's code, keeps the remote session directory and prints `fetch failed; remote outputs kept at HOST:PATH`; the last line still shows `container_exit=`.
  - `124`: the runner found the overall deadline expired between steps, or the wrapper's outer backstop (`--timeout` + 120 s) fired. In the backstop case the named container is removed with `docker rm -f`, and session.txt may be missing.
  - `125`: `docker run` itself failed (daemon error, or no image with `--no-build`).
  - `255`: ssh failed during the run.
  - Add one sentence after the list: the last stdout line is `exit=N container_exit=M elapsed=Ss out=DIR`.
- Timeout bounds: in the `--timeout` option bullet and in the steps grammar (`window`, `sleep`, `waitlog`), state that the values are integers from 1 to 99999 with no leading zero. `0`, `08` or a longer number is refused: exit 2 inside the container, exit 64 for `--timeout`.
- Key failures: in the `key` grammar bullet, add that an unknown keysym (xdotool prints `No such key name`) or a failed xdotool call fails the session with exit 1, because the validator checks only the character set.
- waitlog semantics: replace the `waitlog` grammar bullet's description. It waits up to TIMEOUT seconds for a line containing the fixed string TEXT. Each `waitlog` searches only the lines after the line the previous successful `waitlog` matched; the first one searches from the top of `Latest.log`. A match consumes everything up to and including the matched line. So a line that satisfied one `waitlog` never satisfies a later one, and a marker logged twice satisfies two. A line flushed before the step started still counts if no earlier `waitlog` consumed it, because Oolite flushes its log only every 2 s. If Oolite exits during the wait, the runner checks the log once more before it fails the step. A miss fails the session with exit 1. Mention that session.txt records the matched line number.
- Output layout:
  - Add a `snapshots/` bullet: Oolite's own snapshot directory (`OO_SNAPSHOTSDIR`), usually empty.
  - Extend the `wrapper.txt` bullet with the container name and `fetch=ok` or `fetch=failed`.
- Save directory: correct the sentence that says all game data lives under `$HOME/.local/share/Oolite`. Game data lives there, saves go to `$HOME/oolite-saves` (`OO_SAVEDIR`), and logs and snapshots go to `/out`. Everything outside `/out` is discarded with the container.
- Debug command: change it to `docker run --rm -it --entrypoint bash wegolite-oolite-reference:1.93.1-255`, because without `-it` bash exits at once on empty stdin.
- One run at a time: add a sentence near the Usage text or the Remote directories section saying to run one session at a time, because concurrent runs share `~/oolite-reference` and its `.tmp` sync directory on the remote and can break each other's sync or build.
- Termination (IN-01): add one sentence to the Headless notes. The runner's TERM reaches only the launcher shell, and the oolite process ends at container teardown, which relies on `docker run --init`. run-remote.sh always passes it, so a manual `docker run` of the entrypoint should pass it too.
- Remote directories: change the runs bullet to say that a session directory is deleted after a successful fetch, is kept with its path printed when the fetch fails, and that an interrupted run can also leave one behind to remove by hand.
- Do not add anything about the skipped items (OD-S).

Format the README with Prettier before committing, using the project's pinned version. Either run `docker compose run --rm lint npx prettier --write tools/oolite-reference/README.md` locally (the lint service is cheap), or rely on the remote check below and fix any diff it reports.

Commit ONLY tools/oolite-reference/README.md and .planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md, by explicit path, as `docs(quick-261117-mng): document the reference tool's exit codes and waitlog semantics`. The REVIEW.md is currently untracked; the owner asked that it ship with this task's commits.

Then run the remote gates against the committed HEAD:
- `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npx vitest run tests/compliance.test.ts`, which checks the SPDX header on every .sh file;
- `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm lint npx prettier --check tools/oolite-reference/README.md`.

If prettier fails, fix it, commit the README again by explicit path and rerun the check. If the compliance test fails on a file this plan does not own (the parallel 261117-mne task), report it and do not touch that file.
  </action>
  <verify>
    <automated>M=tools/oolite-reference/README.md; RV=.planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md; RR=/home/opencode/.claude/scripts/wegolite-remote-run.sh; rg -qF 'snapshots/' $M && rg -qF 'docker run --rm -it --entrypoint bash' $M && test "$(rg -c '^- `(0|1|2|64|70|124|125|255)`: ' $M)" = 8 && rg -qF 'oolite-saves' $M && rg -qi 'one run at a time' $M && rg -qF '99999' $M && rg -qi 'consume' $M && rg -qF -- '--init' $M && rg -qF 'fetch=' $M && git ls-files --error-unmatch $RV >/dev/null && S="$(git status --porcelain -- tools/oolite-reference $RV)" && test -z "$S" && C="$(git log --format=%H -E --grep='^[a-z]+\(quick-261117-mng\):' a498409..HEAD)" && test -n "$C" && F="$(git diff-tree --no-commit-id --name-only -r --stdin <<<"$C")" && test -n "$F" && test -z "$(printf '%s\n' "$F" | rg -v '^(tools/oolite-reference/(Dockerfile|entrypoint\.sh|run-remote\.sh|README\.md)|\.planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW\.md|\.planning/quick/261117-mng-harden-the-oolite-reference-tool-per-rev/.+|\.planning/STATE\.md)$')" && DN="$(git diff --name-only a498409 HEAD)" && test -z "$(printf '%s\n' "$DN" | rg -i '\.(oxp|png|log|appimage)$|script\.js$')" && "$RR" run --rm test npx vitest run tests/compliance.test.ts && "$RR" run --rm lint npx prettier --check tools/oolite-reference/README.md  # gates (invariant guards: commit scope, no Oolite artefacts): snapshots/ [HEAD=0 EXPECT>=1]; -it debug command [HEAD=0 EXPECT==1]; exit-code bullets [HEAD=0 EXPECT==8]; oolite-saves [HEAD=0 EXPECT>=1]; one run at a time [HEAD=0 EXPECT>=1]; 99999 [HEAD=0 EXPECT>=1]; consume [HEAD=0 EXPECT>=1]; --init [HEAD=0 EXPECT>=1]; fetch= [HEAD=0 EXPECT>=1]; REVIEW.md tracked [HEAD=absent EXPECT==present]; files outside the allow-list in 261117-mng commits [HEAD=0 EXPECT==0 @a498409 GUARD MUTATION: staging src/sim/flight/torus.ts in a 261117-mng commit]; Oolite artefacts committed [HEAD=0 EXPECT==0 @a498409 GUARD MUTATION: committing /tmp/ooref-mng/title/screenshots/01-title.png]</automated>
  </verify>
  <done>
- The README states the real exit codes (0, 1, 2, 64, 70, 124, 125, 255), the timeout bounds, key failures, the consumed-line waitlog semantics, `snapshots/`, the save directory, the `-it` debug command, one run at a time and the `--init` reliance.
- The Opus review is tracked.
- Every 261117-mng commit touches only this plan's files, and nothing Oolite-derived is committed.
- The remote compliance test and the README prettier check pass on the committed HEAD.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| local wrapper -> remote shell (ssh) | Script-generated paths, the validated timeout and the container name are interpolated into remote command strings |
| steps file -> in-container runner | Agent-written steps drive xdotool, sleep and waitlog; their values are validated before Oolite starts |
| fetched outputs -> caller | Callers trust the exit code and the files in `--out` as measurement evidence |
| Oolite release -> image | The third-party AppImage enters the image only through the SHA256-pinned fetch stage |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-mng-01 | Denial of service | step timeouts, OOREF_TIMEOUT, ssh `docker run` | medium | mitigate | OD-3: `^[1-9][0-9]{0,4}$` validators (exit 2 in the container, exit 64 in the wrapper), a unique `--name`, `timeout $((TIMEOUT + 120)) ssh -n`, and `docker rm -f` on 124. Task 1 proves the rejections (window0, sleep0, `--timeout 08`/`0`, `OOREF_TIMEOUT=08`). |
| T-mng-02 | Repudiation (false success) | fetch, key step, waitlog step | high | mitigate | OD-2: a failed fetch exits 70 and keeps the remote session. OD-4: key fails on the xdotool status or `No such key name`. OD-5: a consumed-line cursor with a final check after Oolite exits. Each is proven by a negative run in Task 1 or Task 2 (fetchro/fetchmk, badkey, never, consume). |
| T-mng-03 | Information disclosure (licence posture) | `--out`, kept remote session dirs, git index | high | mitigate | The in-repo `--out` guard is unchanged (exit 64). All evidence stays under /tmp/ooref-mng/. Kept session dirs exist only on the remote test machine, outside any checkout, and Task 1 removes them after reading them. The Task 3 gate fails on any committed `.oxp/.png/.log/.AppImage/script.js`. |
| T-mng-04 | Tampering (supply chain) | Dockerfile fetch stage | high | mitigate | OD-6 keeps the pinned APPIMAGE_SHA256 and `sha256sum -c`, with a single OOLITE_VERSION source for the URL. Task 1 requires `oolite.AppImage: OK` in the build output and the pinned SHA in session.txt. A mismatch is stop-and-report, never a re-pin. |
| T-mng-05 | Elevation of privilege (remote command injection) | container name in `docker run --name` and `docker rm -f` | low | mitigate | The name is `ooref-` plus the basename of the remote `mktemp -d` directory, and it passes through `printf %q` like every other interpolated value. |
| T-mng-06 | Tampering (parallel work) | shared working tree with 261117-mne | medium | mitigate | Staging is by explicit path only, and src/, tests/, FIDELITY.md, CHANGELOG.md and the measurement todo are never touched. The Task 3 gate checks that every 261117-mng commit touches only the allow-listed files. |
| T-mng-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs. The Dockerfile's apt package list is unchanged, and the AppImage stays SHA256-pinned. |
</threat_model>

<verification>
- Task 1, Task 2 and Task 3 automated verifies all pass. Their evidence lives under /tmp/ooref-mng/, outside the repository.
- The shipped steps files are unchanged (`git diff --quiet a498409 HEAD -- tools/oolite-reference/steps`).
- No verify, verify-full or e2e was run (owner gate policy). The only repository gates are the remote compliance test and the README prettier check.
- The SUMMARY records, for every evidence run:
  - the exit code and the final `exit=... container_exit=...` line;
  - the session.txt of title, docked, badkey and consume;
  - the xdotool stderr text and rc for `Retrun`;
  - the remote session paths kept and then removed in the fetch simulation;
  - the image IDs before and after.
</verification>

<success_criteria>
- OD-1..OD-7 are each implemented as specified, and no OD-S item is implemented.
- Every false success the reviews named in scope is closed and proven by a negative run: lost fetch -> 70, mistyped key -> 1, consumed marker -> 1, zero or leading-zero timeouts -> 2 or 64.
- The happy paths (title.steps, and docked.steps with the smoke OXP) still exit 0 with real screenshots, through an image rebuilt from the single-version Dockerfile with the SHA check passing.
- The three task commits contain only the allow-listed files. The REVIEW.md is committed. The remote compliance and prettier checks pass.
</success_criteria>

<output>
Create `.planning/quick/261117-mng-harden-the-oolite-reference-tool-per-rev/261117-mng-SUMMARY.md` when done
</output>
