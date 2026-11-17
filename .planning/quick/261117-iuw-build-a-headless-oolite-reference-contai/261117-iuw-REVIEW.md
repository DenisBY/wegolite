---
phase: quick-261117-iuw
reviewed: 2026-11-17T14:52:52Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - tools/oolite-reference/Dockerfile
  - tools/oolite-reference/entrypoint.sh
  - tools/oolite-reference/run-remote.sh
  - tools/oolite-reference/steps/title.steps
  - tools/oolite-reference/steps/docked.steps
  - tools/oolite-reference/README.md
findings:
  critical: 0
  warning: 8
  info: 9
  total: 17
  necessity: 1
status: issues_found
---

# Quick 261117-iuw: Code Review Report

**Reviewed:** 2026-11-17T14:52:52Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

I reviewed the headless Oolite reference tool: the image, the in-container session runner, the ssh wrapper, the two shipped steps files and the README (checked against the scripts only). I checked the upstream launcher behaviour in `/home/opencode/git/oolite/ShellScripts/Linux/run_oolite.sh` and the gate wrapper `~/.claude/scripts/wegolite-remote-run.sh` to look for remote collisions. I started no containers. I ran three local bash/tar probes in `/tmp`, and each one confirmed a claim below.

There are no Critical findings. Every value that reaches a remote shell is either `printf %q`-quoted or validated (`--timeout`). The steps file goes over ssh stdin, and add-on names never reach the remote shell. The licence guard holds for the default path. The image is digest-pinned, runs as a non-root user and uses `--network none`. The remote paths do not collide with `~/wegolite-remote`, because the gate wrapper only touches `~/wegolite-remote{,.tmp}` and never prunes images.

The main problems are robustness gaps in a tool that callers trust for exit codes and outputs:
- The overall deadline is only cooperative and can be bypassed completely (`window 0`, or an overflowing integer).
- The wrapper has no outer timeout and no cleanup trap.
- A failed fetch still exits 0 and then deletes the only remote copy of the outputs.
- Add-on names go through a broken `printf %q` round trip, and without `pipefail` a partly failed local tar is masked.
- `waitlog` matches stale lines.
- The documented exit-code contract (124 = deadline) is not what the runner does.

## Warnings

### WR-01: The overall deadline can be bypassed and has no hard outer bound

**File:** `tools/oolite-reference/entrypoint.sh:57,60,175-179,191-193`; `tools/oolite-reference/run-remote.sh:100`
**Issue:** `OOREF_TIMEOUT` is enforced only between steps, and each step caps itself against `left`. That cap fails in two ways:
- The validators accept `0` (`^[0-9]+$`). `window 0` therefore runs `timeout 0 xdotool search --sync ...`, and coreutils documents "A duration of 0 disables the associated timeout". If no Oolite window appears, the step blocks forever.
- An overflowing integer (`sleep 99999999999999999999`) makes `[ "$t" -gt "$left" ]` error out with "integer expected", which I reproduced locally. The `&& t=$left` cap is then skipped, and GNU `sleep` sleeps effectively forever.

`xdotool` and `import` also run with no per-call timeout. The wrapper adds no backstop either: `ssh "$H" "docker run ..."` has no timeout, and the container has no `--name`, so nothing can stop it later.
**Fix:**
```bash
# entrypoint.sh validation: positive, bounded integers only
window) [[ -z "$rest" || "$rest" =~ ^[1-9][0-9]{0,4}$ ]] || die_usage ... ;;
sleep)  [[ "$rest" =~ ^[0-9]{1,5}$ ]] || die_usage ... ;;
waitlog) [[ "$wl_timeout" =~ ^[0-9]{1,5}$ ]] || die_usage ... ;;
# and wrap the slow external calls
timeout "$left" import -display :99 -window "$target" "$file"
```
```bash
# run-remote.sh: hard outer deadline plus a named container
NAME="ooref-$STAMP-$$"
RUN_ARGS="--name $NAME $RUN_ARGS"
timeout $((TIMEOUT + 60)) ssh "$H" "docker run $RUN_ARGS $IMAGE"; RC=$?
[ "$RC" -eq 124 ] && ssh "$H" "docker rm -f $NAME" >/dev/null 2>&1
```

### WR-02: No cleanup trap in the wrapper, so an interrupted run leaks a container and remote directories

**File:** `tools/oolite-reference/run-remote.sh:76-107`
**Issue:** Remote cleanup (`rm -rf $SESSION`, line 107) runs only on the straight-line path. These cases leave state behind:
- Ctrl-C, a dropped ssh connection or a local kill during `docker run` (line 100) leaves the session directory in `~/oolite-reference-runs/` for good.
- The anonymous container keeps running until its own cooperative deadline, or forever per WR-01. No ssh signal reaches it, because the remote command has no tty.
- A failure between lines 89 and 98 (for example the add-on sync) exits 70 and leaves `$SESSION` behind.
- A failed sync leaves `~/oolite-reference.tmp` behind.

The README says the runs directory is "deleted after the fetch", which is only true on the happy path.
**Fix:** Name the container (see WR-01). After `SESSION` is known, install one trap that tears everything down:
```bash
cleanup() { ssh -n "$H" "docker rm -f $NAME >/dev/null 2>&1; rm -rf $(printf %q "$SESSION")" || true; }
trap 'cleanup' EXIT
trap 'exit 130' INT TERM HUP
```
Then drop the inline `rm -rf` at line 107, or keep it and make the trap idempotent.

### WR-03: A failed fetch exits with the container's code (often 0) and then deletes the only copy of the outputs

**File:** `tools/oolite-reference/run-remote.sh:104-107,126`
**Issue:**
- If the fetch pipeline fails (ssh drop, remote tar error or a local disk problem), the wrapper only prints `warning: fetch failed`, still deletes `$SESSION` on the remote at line 107, and exits with the container's code.
- A successful session with a failed fetch therefore exits 0 with an empty or partial `OUT`, and the screenshots and `Latest.log` are gone from the remote too.
- `mkdir -p "$OUT"` (line 104) is unchecked as well. If it fails, the `wrapper.txt` redirect (line 123) fails too, and the run can still exit 0.

Callers read the exit code as "outputs fetched".
**Fix:**
```bash
set -o pipefail
FETCH_OK=1
mkdir -p -- "$OUT" && ssh -n "$H" "tar -C $(printf %q "$SESSION/out") -cf - ." | tar -m -x -C "$OUT" || FETCH_OK=0
if [ "$FETCH_OK" -eq 1 ]; then
  ssh -n "$H" "rm -rf $(printf %q "$SESSION")" || true
else
  echo "fetch failed; remote outputs kept at $H:$SESSION" >&2
  [ "$RC" -eq 0 ] && RC=70
fi
```

### WR-04: Add-on names break on a word-split `printf %q` round trip, and `pipefail` is missing so a partial tar is masked

**File:** `tools/oolite-reference/run-remote.sh:66,95-96` (also 76-78)
**Issue:** `ADDON_NAMES` is a space-joined string, and line 95 passes `$(printf '%q ' $ADDON_NAMES)` unquoted. Quote removal does not apply to expansion results, so:
- the string is split on spaces twice;
- `printf %q` backslashes stay literal;
- glob characters in names are expanded.

I reproduced this locally: `My Probe.oxp` becomes the two words `[My] [Probe.oxp]`, and `a'b.oxp` becomes the literal `[a\'b.oxp]`. A name that begins with `-` is passed to `tar` as an option, because there is no `--`. The glob also matches regular files, while the README says "`*.oxp` folders".

The script sets only `set -u`, not `pipefail`. When local `tar` cannot find some members, it still streams the rest and exits 2, the remote `tar -x` succeeds, and the pipeline reports success. The session then runs without the missing add-ons and can exit 0, while `wrapper.txt` (line 120) lists every name as if it had been loaded. The sync pipeline at lines 76-78 has the same masking.
**Fix:**
```bash
set -uo pipefail
shopt -s nullglob
ADDON_LIST=()
for d in "$ADDONS"/*.oxp/; do d=${d%/}; ADDON_LIST+=("${d##*/}"); done
[ ${#ADDON_LIST[@]} -gt 0 ] || { echo "--addons directory has no *.oxp folder" >&2; exit 64; }
tar -C "$ADDONS" -cf - -- "${ADDON_LIST[@]}" | ssh "$H" "..." || { echo "addons sync failed" >&2; exit 70; }
ADDON_NAMES="${ADDON_LIST[*]}"
```

### WR-05: Concurrent runs collide on the remote sync directory and the default local output directory

**File:** `tools/oolite-reference/run-remote.sh:49,57,76-78,83,104`
**Issue:**
- Every run syncs through the same `~/oolite-reference.tmp` and swaps it into `~/oolite-reference` with `rm -rf` and `mv`. A second run that starts while the first one's `docker build` reads `~/oolite-reference` as its context deletes that context under it, or makes the build fail.
- Both runs also `rm -rf` the same `.tmp`.
- The default `OUT` has one-second resolution, and the empty-directory guard runs minutes before `mkdir -p "$OUT"` (line 104). Two runs started in the same second both pass the guard and extract into one directory, overwriting each other's `session.txt` and screenshots.

Agents start quick tasks in parallel, so this can happen.
**Fix:**
- Serialise sync and build on the remote with `flock`, for example `ssh "$H" "flock ~/oolite-reference.lock sh -c '...sync+build...'"`, or use a `mktemp -d` sync directory per run.
- Claim `OUT` atomically at guard time: `mkdir -- "$OUT" 2>/dev/null || [ -z "$(ls -A -- "$OUT")" ] || refuse`. Add `$$` or a random suffix to the default stamp.

### WR-06: The exit-code contract does not match the runner: a deadline hit inside `window` or `waitlog` exits 1, not 124

**File:** `tools/oolite-reference/entrypoint.sh:171,176,184,211,225`; `tools/oolite-reference/README.md:72-75`; `tools/oolite-reference/run-remote.sh:12-14`
**Issue:** The README and the script headers say "124 the overall deadline expired".
- When `window` or `waitlog` is capped to `left` (lines 176 and 211) and then times out, the runner calls `fail 1`, so a deadline expiry is reported as a step failure.
- Exit 124 only happens when a `sleep` exhausts the deadline and another step follows. If a capped `sleep` is the last step, a run that hit the deadline exits 0.
- The wrapper also passes through codes the table does not list: 125 or 126 from `docker run` (daemon error, or a missing image with `--no-build`), and 255 from `ssh` when the connection fails.
**Fix:** Record whether the step was capped (`capped=1` when `t` is set to `left`), call `fail 124 ...` instead of `fail 1` when a capped step times out, and return 124 after the loop if `remaining` is 0. Add 125 (docker) and 255 (ssh) to the exit-code tables in the README and in the `run-remote.sh` header.

### WR-07: `waitlog` matches stale lines and can miss the final flush

**File:** `tools/oolite-reference/entrypoint.sh:213-220`
**Issue:**
- Each poll greps the whole of `Latest.log`. A second `waitlog` for the same marker succeeds at once on the earlier occurrence, so a later `shot` is taken before the event it was meant to wait for. Measurement OXPs log repeated markers, so this gives silently wrong captures.
- If Oolite exits between a failed grep and `kill -0`, the loop breaks without one last grep of the now-flushed log. The step then reports "not found", even though the line is in the fetched `Latest.log`.
**Fix:**
```bash
LOG_OFF=${LOG_OFF:-0}   # global, bytes already consumed by earlier waitlogs
...
if [ -f "$LOG" ] && tail -c +"$((LOG_OFF + 1))" "$LOG" | grep -qF -- "$wtext"; then
  LOG_OFF=$(stat -c %s "$LOG"); found=1; break
fi
kill -0 "$OOLITE_PID" 2>/dev/null || { sleep 2; [ -f "$LOG" ] && tail -c +"$((LOG_OFF + 1))" "$LOG" | grep -qF -- "$wtext" && found=1; break; }
```
(A byte offset can split a line; use a line count with `tail -n +N` if that matters.) If whole-file matching is intended, say so in the README grammar.

### WR-08: `key` and `windowfocus` failures are reported as "ok"

**File:** `tools/oolite-reference/entrypoint.sh:187,197,202-205`
**Issue:** The exit codes of `xdotool keydown/keyup` and `windowfocus` are discarded, and line 205 records `key ... ok` unconditionally. The validator accepts any `[A-Za-z0-9_+]+` word, so a typo such as `key Retrun` passes validation. xdotool reports it as an unknown key name and sends nothing, but `session.txt` still says `ok` and the run exits 0. A lost focus (line 187 or 197) is just as silent. That is a false success in the tool whose job is to drive Oolite reproducibly.
**Fix:**
```bash
for ks in $arg; do
  xdotool keydown "$ks" sleep 0.5 keyup "$ks" sleep 0.3 2>>"$OUT/xdotool.log" \
    || { STEP_REPORT+="step $idx: key $ks FAILED"$'\n'; fail 1 "xdotool could not send '$ks'"; }
done
```
Also grep `xdotool.log` for "No such key name" and treat it as a failure, because some xdotool versions exit 0 after that warning. Check `windowfocus` the same way when `WIN_ID` is set.

## Info

### IN-01: `OOLITE_PID` is the launcher shell, so the TERM/KILL sequence never reaches Oolite

**File:** `tools/oolite-reference/entrypoint.sh:91-100,152-155,160-162`
**Issue:**
- `$!` is the PID of `/opt/oolite/AppRun`. The entrypoint's own comment (line 149) names it `run_oolite.sh`, and upstream that script runs the binary as a child, not with `exec` (`/home/opencode/git/oolite/ShellScripts/Linux/run_oolite.sh:110`).
- `kill -TERM` kills only the bash launcher. The `oolite` process is reparented to tini and dies only when the container tears down.
- The 20 × 0.5 s polling loop watches the launcher, not Oolite.
- It works today because Oolite has no signal handler and `--init` is always passed. Without `--init` (for example the README's manual `docker run`), the orphan's fate depends on teardown order.
**Fix:** Start the launcher in its own process group (`setsid /opt/oolite/AppRun -nosplash ... &`) and signal the group (`kill -TERM -- -"$OOLITE_PID"`), or use `pkill -TERM -P "$OOLITE_PID"`. Alternatively, change the comment to say that termination relies on container teardown.

### IN-02: `OOREF_TIMEOUT` with a leading zero is parsed as octal; an empty steps file is accepted

**File:** `tools/oolite-reference/entrypoint.sh:34,42`; `tools/oolite-reference/run-remote.sh:43`
**Issue:**
- `^[0-9]+$` accepts `08`, but `$((TIMEOUT_TOTAL - ...))` reads it as octal. `08` fails with "value too great for base" (reproduced locally), so `left` is empty and the first step fails with exit 124 at once. `010` silently becomes 8 s.
- A steps file that holds only comments passes validation, starts Xvfb and Oolite, and exits 0 at once.
**Fix:** Validate with `^[1-9][0-9]{0,5}$` (or use `$((10#$TIMEOUT_TOTAL - ...))`), and reject an empty step list with `die_usage "no steps"`.

### IN-03: Unquoted `$rest` is glob-expanded before it is validated

**File:** `tools/oolite-reference/entrypoint.sh:67`
**Issue:** `for ks in $rest` runs pathname expansion against the working directory (`/home/oolite`) before the keysym regex check. The check rejects the expanded names, so this is harmless today, but it validates something other than what the file says. The run loop (line 202) is safe only because validation has already run.
**Fix:** Validate with `read -ra keys <<<"$rest"; for ks in "${keys[@]}"; ...`, or run `set -f` around both loops.

### IN-04: Version pin is duplicated, an ARG is unused, and there is a debug `ls`

**File:** `tools/oolite-reference/Dockerfile:17-18,28,34,57`; `tools/oolite-reference/run-remote.sh:19`
**Issue:**
- `ARG OOLITE_VERSION` in the fetch stage is unused, because `APPIMAGE_URL` hard-codes `1.93.1-255`.
- The version also appears in the runtime ARG, the image tag in `run-remote.sh` and the README.
- `session.txt` reports `oolite_version` from the ARG, not from the binary. A partial bump, or a `--build-arg APPIMAGE_URL=...` override, would record a wrong version in the provenance file.
- The bare `ls` at line 28 is a leftover debug artifact.
**Fix:** Use `ARG APPIMAGE_URL=https://github.com/OoliteProject/oolite/releases/download/${OOLITE_VERSION}/Oolite-${OOLITE_VERSION}-deployment-x86_64.AppImage`, drop the `ls`, and have `run-remote.sh` read the tag from one variable. Optionally grep the version line from `Latest.log` into `session.txt`.

### IN-05: The build is not fully reproducible: floating syntax frontend and unpinned apt packages

**File:** `tools/oolite-reference/Dockerfile:1,20-22,38-43`
**Issue:**
- `# syntax=docker/dockerfile:1` pulls a floating frontend tag from Docker Hub at build time. The root `Dockerfile` does the same, so this is a project-wide habit, but `AGENTS.md` asks for pinned tags.
- The apt installs float with bookworm point releases and security updates, so Mesa/llvmpipe can change between rebuilds. Physics logged through JS does not depend on it, but screenshots used for UI comparison do.
**Fix:** Pin `docker/dockerfile:1.x@sha256:...`. Record `dpkg-query -W libgl1-mesa-dri xvfb` into the image (for example `/opt/ooref-packages.txt`) and copy it into `session.txt`, or install from `snapshot.debian.org` at a fixed timestamp.

### IN-06: Hardening for `docker run`

**File:** `tools/oolite-reference/run-remote.sh:92-100`
**Issue:**
- Before the first build, `--no-build` makes the daemon try to pull `docker.io/library/wegolite-oolite-reference`. That fails with 125, but it is a pointless network call.
- The container runs an add-on JS payload, yet it has no `--cap-drop ALL`, `--security-opt no-new-privileges`, `--pids-limit` or `--memory` limit.
**Fix:** Add `--pull never --cap-drop ALL --security-opt no-new-privileges --pids-limit 512 --memory 4g`. All of these are compatible with Xvfb running as a non-root user.

### IN-07: ssh hygiene and error-message issues in the wrapper

**File:** `tools/oolite-reference/run-remote.sh:71-107`
**Issue:**
- Only the first `ssh` uses `-o BatchMode=yes`. If auth changes mid-run, a later call can hang on a password prompt.
- No call uses `-n`, so they consume the caller's stdin (for example `while read ...; do run-remote.sh; done <list` stops after the first iteration).
- `ssh "$H"` without `--` lets an `OOREF_HOST` value that starts with `-` become ssh options. The user sets this variable themselves, so this is local only.
- The messages at lines 79, 82, 84, 89, 90 and 96 go to stdout, not stderr, and the uid/gid lookup failure (line 82) is reported as "sync failed".
- `printf %q` output (`$'...'` forms) assumes the remote login shell is bash.
**Fix:** Define `rssh() { ssh -n -o BatchMode=yes -- "$H" "$@"; }` and use plain `ssh -o BatchMode=yes -- "$H"` only where stdin is piped. Send the messages to `>&2` and correct the line 82 message.

### IN-08: The output guard protects only the git toplevel of the script's own checkout

**File:** `tools/oolite-reference/run-remote.sh:52-56`
**Issue:** `git rev-parse --show-toplevel` returns the current worktree. If the script runs from an Orca or git worktree, `--out /home/opencode/git/wegolite/...` (the main checkout) is not refused, and the reverse is also true. Oolite screenshots and logs (CC BY-NC-SA) can then land in a tracked tree.
**Fix:** Refuse any path inside any worktree of the repository:
```bash
while read -r k p; do [ "$k" = worktree ] || continue
  [ "$OUT" = "$p" ] || [[ "$OUT" == "$p"/* ]] && { echo "refusing ..." >&2; exit 64; }
done < <(git -C "$SCRIPT_DIR" worktree list --porcelain)
```

### IN-09: README drift against the scripts

**File:** `tools/oolite-reference/README.md:51-53,61-70,79-83,134-137,146-149,154-161`
**Issue:**
- (a) Line 147: `docker run --rm --entrypoint bash wegolite-oolite-reference:1.93.1-255` has no `-it`, so bash exits at once on empty stdin.
- (b) The output layout leaves out `snapshots/`, which the runner creates and the wrapper fetches.
- (c) "The whole file is validated" (line 80), but the rule "Must come before the first `key` or window `shot`" (line 83) is not enforced. Validation also happens only inside the container, after sync, build and session setup, so a typo costs a full round trip.
- (d) Lines 136-137 say all game data lives under `$HOME/.local/share/Oolite`, but saves go to `$HOME/oolite-saves` (`OO_SAVEDIR`, `entrypoint.sh:153`), and logs and snapshots go to `/out`.
- (e) `--addons` "is copied": only the `*.oxp` children are copied.
- (f) The remote directories section leaves out `~/oolite-reference.tmp`, and the runs directory survives an interrupted run (WR-02).
- (g) The exit-code table is covered in WR-06.
**Fix:**
- Add `-it` to the debug command.
- List `snapshots/` in the output layout.
- Either enforce the ordering rule in the validator or reword it as advice.
- Run the same validator locally before the first ssh, for example `bash entrypoint.sh --check FILE`.
- Correct the data-location sentence, the `--addons` wording and the remote directories list.

### IN-10: Already defended elsewhere: the runner pre-creates directories the launcher creates

**File:** `tools/oolite-reference/entrypoint.sh:86`
**Category:** necessity
**Issue:** `mkdir -p "$HOME/oolite-saves" "$HOME/.local/share"` repeats work the AppImage launcher does unconditionally. It runs `mkdir -p "$GAME_DATA"` and `mkdir -p "$OO_SAVEDIR"` (`/home/opencode/git/oolite/ShellScripts/Linux/run_oolite.sh:188,191`), with `GAME_DATA=$HOME/.local/share/Oolite` under `OO_DIRTYPE=xdg` (`:162`). This rests on the checkout's launcher matching the one in the 1.93.1-255 AppImage, which is likely but not shown, hence Info. The `$OUT/logs`, `$OUT/screenshots` and `$OUT/snapshots` creations are not redundant in the same way: they double as an early writability check of `/out`.
**Fix:** Drop the two `$HOME` paths from line 86 and keep the `/out` ones.

---

_Reviewed: 2026-11-17T14:52:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
