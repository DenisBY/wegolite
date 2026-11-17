---
phase: quick
plan: 261117-mng
subsystem: tools/oolite-reference
tags: [oolite, reference-tool, hardening, shell, docker]
requires: []
provides:
  - bounded step and session timeouts (1..99999) with an outer ssh timeout and a named container
  - honest fetch (exit 70, remote session kept) and key/waitlog failure semantics
  - README that matches the real exit codes
affects: [tools/oolite-reference]
tech-stack:
  added: []
  patterns: [consumed-line cursor for log waits, global Dockerfile ARG as single version source]
key-files:
  created: []
  modified:
    - tools/oolite-reference/Dockerfile
    - tools/oolite-reference/entrypoint.sh
    - tools/oolite-reference/run-remote.sh
    - tools/oolite-reference/README.md
    - .planning/quick/261117-iuw-build-a-headless-oolite-reference-contai/261117-iuw-REVIEW.md
decisions:
  - "A fetch failure overrides the container exit code with 70; container_exit= is still printed."
  - "waitlog cursor counts lines and moves to the matched line on success."
metrics:
  completed: 2026-11-17
status: complete
commits: 3
plan_head_before: 27f910ee37c7a8dd2d7dd5bb35a7b0dae099b48e
plan_head_after: 2b9f9573ffe343c608e5cd2a724d78b05693b403
actuals:
  tokens: 11000
  tasks: 3
  commits: 3
---

# Phase quick Plan 261117-mng: Harden the Oolite reference tool Summary

OD-1..OD-7 implemented: bounded deadlines, a named container under an outer `timeout ... ssh -n`, a fetch that exits 70 and keeps the remote session, a `key` step that checks xdotool, a consumed-line `waitlog`, and a single-version Dockerfile. No OD-S item was implemented.

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 (tracer) | 0f7d639 `fix(quick-261117-mng): bound the reference session deadline and fail on a lost fetch` | Dockerfile, run-remote.sh, entrypoint.sh |
| 2 | 6a209b5 `fix(quick-261117-mng): fail on unknown keys and consume waitlog matches` | entrypoint.sh |
| 3 | 2b9f957 `docs(quick-261117-mng): document the reference tool's exit codes and waitlog semantics` | README.md, 261117-iuw-REVIEW.md |

## What changed

- Dockerfile (OD-6): global `ARG OOLITE_VERSION` and `ARG APPIMAGE_SHA256` once each; the stages re-declare them bare; the URL is built from `${OOLITE_VERSION}`; `sha256sum -c` kept; the `ls` debug step and the `APPIMAGE_URL` ARG are gone.
- entrypoint.sh (OD-3/4/5/7): `^[1-9][0-9]{0,4}$` in four places; `key` checks the xdotool rc and `No such key name`; `waitlog` uses `LOG_LINE` plus `log_match`, with a final check after Oolite exits; IN-01 comment above `shutdown_all`; header exit codes rewritten.
- run-remote.sh (OD-1/2/3): `set -uo pipefail`; `--timeout` validated (exit 64); `--name ooref-<mktemp suffix>`; `timeout $((TIMEOUT + 120)) ssh -n ... docker run`; `docker rm -f` on 124; fetch guarded (`mkdir -p`, pipeline under pipefail), exit 70 and session kept with the `fetch failed; remote outputs kept at HOST:PATH` line; wrapper.txt gains `fetch=` and `container=`; last line `exit=$FINAL container_exit=$RC ...`.
- README (OD-7): eight exit-code bullets, timeout bounds, key failures, waitlog semantics, `snapshots/`, save dir, `-it` debug command, one run at a time, `--init` reliance, runs-directory lifecycle.

## Evidence runs

All run from the repo root; evidence is under `/tmp/ooref-mng/` (outside the repo). Remote: opencode@192.168.178.51.

Image IDs: before `sha256:dc38033d6928c84b49ab8bbd16302e4d66a82b97442465ec691c88f7057ab68a`; after Task 1 build `sha256:b934b39ec1d97c2ff091c4f4195464521ede14fa16e70149edab9ec919d97b85`; after Task 2 build (final) `sha256:f59a379015e8f9f48294756b04a0d92bf06cd70d8252dec06434034ab48fd69c`. The two superseded IDs were removed with `docker rmi <exact id>`.

| Run | Command (abridged) | rc | Key output |
| --- | ------------------ | -- | ---------- |
| baseline | `ssh ... ls -A ~/oolite-reference-runs` | 0 | empty (runs-before.txt) |
| title (with build) | `run-remote.sh --out $W/title --steps steps/title.steps` | 0 | build output `#10 14.95 oolite.AppImage: OK`; `exit=0 container_exit=0 elapsed=57s`; 01-title.png 378297 bytes; session.txt has `oolite_version=1.93.1-255` and `appimage_sha256=4ec9ab5f...66a8`; wrapper.txt `fetch=ok`, `container=ooref-20261117T153459Z-z1UpOI` |
| t08 | `OOREF_HOST=nohost.invalid run-remote.sh --timeout 08` | 64 | `--timeout must be an integer from 1 to 99999` |
| t0 | `OOREF_HOST=nohost.invalid run-remote.sh --timeout 0` | 64 | same message |
| window0 | `--no-build --steps window0.steps` (`window 0`) | 2 | `line 1: window takes an optional timeout, an integer from 1 to 99999`; `exit=2 container_exit=2`; no oolite-stdout.log |
| sleep0 | `--no-build --steps sleep0.steps` (`window 120`, `sleep 0`) | 2 | `line 2: sleep takes an integer number of seconds from 1 to 99999`; no oolite-stdout.log |
| envtimeout | `docker run --rm --network none -e OOREF_TIMEOUT=08 <image>` | 2 | `OOREF_TIMEOUT must be an integer from 1 to 99999` |
| fetchro | `--no-build --out ro-out (chmod 555) --steps short.steps` | 70 | tar `Permission denied` errors; `fetch failed; remote outputs kept at opencode@192.168.178.51:/home/opencode/oolite-reference-runs/20261117T153539Z-mqpHri`; `exit=70 container_exit=0`. Remote session.txt showed `exit=0` (saved as fetchro.remote-session.txt); path removed with `rm -rf --` |
| fetchmk | `--no-build --out ro-out/sub (ro-out chmod 555)` | 70 | `mkdir: cannot create directory ... Permission denied`; kept path `.../20261117T153609Z-hD4Xhj`; wrapper.txt write failure reported on stderr (`warning: could not write .../wrapper.txt`); `exit=70 container_exit=0`. Remote session.txt `exit=0`; path removed |
| runs-after | `ssh ... ls -A ~/oolite-reference-runs` | 0 | equals runs-before.txt (every successful fetch deleted its session; both kept sessions removed by hand) |
| docked (rebuild) | `run-remote.sh --out $W/docked --steps steps/docked.steps --addons /tmp/oolite-ref-smoke/addons` | 0 | `exit=0 container_exit=0 elapsed=37s`; two `key Return ok`; screenshots 377101, 305184 and 303535 bytes; 03-docked.png read and shows Commander Jameson, Present System Lave, Condition Docked; smoke OXP startUp line in Latest.log |
| badkey | `--no-build --steps badkey.steps` (`window 120`, `sleep 5`, `key Retrun`) | 1 | `step 3: key Retrun FAILED rc=0`; xdotool stderr `(symbol) No such key name 'Retrun'. Ignoring it.`; `error:` line in session.txt; `exit=1`. rc=0 confirms the stderr text is the signal that fires (xdotool exits 0 for an unknown keysym) |
| never | `--no-build --steps /tmp/oolite-ref-smoke/never.steps` | 1 | `step 2: waitlog FAILED text='this line never appears'`; `exit=1 container_exit=1`; Latest.log 11231 bytes fetched; wrapper.txt `fetch=ok` |
| consume | `--no-build --steps consume.steps --addons $W/addons` | 1 | steps 6, 7, 8 `waitlog ok line=67`, `line=68`, `line=69` (strictly increasing); step 9 `waitlog FAILED text='MNG twice'`; exactly two `MNG twice` lines in Latest.log (lines 68, 69); `exit=1` |
| runs-after2 | `ssh ... ls -A ~/oolite-reference-runs` | 0 | equals runs-before.txt |

Repository gates (remote, committed HEAD 2b9f957): `wegolite-remote-run.sh run --rm test npx vitest run tests/compliance.test.ts` exit 0 (16 tests passed); `run --rm lint npx prettier --check tools/oolite-reference/README.md` exit 0 ("All matched files use Prettier code style!"). Prettier `--write` locally left the README unchanged. No verify, verify-full or e2e was run. The Task 1/2/3 static assertions and commit-scope guards all pass; `git diff --quiet a498409 HEAD -- tools/oolite-reference/steps` is clean.

## Deviations from Plan

**1. [Rule 1 - Plan bug] consume.steps needed to start the game**
- **Found during:** Task 2 (consume run)
- **Issue:** The plan's consume.steps (`window 120`, then waitlogs) never leaves the title screen. World script `startUp` runs only when a game starts, so the first run failed at `waitlog 60 MNG hello` (the tool behaved correctly; Latest.log showed the OXP found at `/addons/wegolite-mng.oxp` but no `MNG` lines). Evidence kept as consume-attempt1*.
- **Fix:** Added `sleep 10`, `key Return`, `sleep 3`, `key Return` after `window 120`, the same sequence docked.steps uses. The waitlog steps are therefore numbered 6-9, not 2-5. The verify assertion was applied with `^step [678]:` and `^step 9:` instead of `[234]` and `5`; the semantics are identical (three increasing `waitlog ok line=N`, then FAILED, two `MNG twice` lines).
- **Files modified:** none in the repo (scratch steps file under /tmp).

**2. [Rule 3 - Blocker in the test method] the fetchmk simulation first passed**
- **Found during:** Task 1 (f)
- **Issue:** The fetchro run's `tar -x` applied the archive's `./` entry mode (755) to the 555 directory, so ro-out was writable for the fetchmk run, which then succeeded (rc 0, kept as fetchmk-first-attempt*).
- **Fix:** Removed `ro-out/sub`, re-ran `chmod 555 ro-out` and re-ran fetchmk, which then exited 70 as expected. No script change.

No change to the shipped steps files. Not tested: the 124 outer-backstop path (`docker rm -f` on timeout), because the plan has no evidence run for it.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or schema; the container name is built from the remote mktemp suffix and passes through `printf %q` (T-mng-05). The in-repo `--out` guard is unchanged, no Oolite-derived file is committed (static guard passed), and kept remote session directories were read and removed (T-mng-03).

## Self-Check: PASSED

- 0f7d639, 6a209b5 and 2b9f957 are ancestors of HEAD, and all three commits are the only ones containing `quick-261117-mng` in their subject.
- tools/oolite-reference/{Dockerfile,entrypoint.sh,run-remote.sh,README.md} and 261117-iuw-REVIEW.md are tracked and clean.
