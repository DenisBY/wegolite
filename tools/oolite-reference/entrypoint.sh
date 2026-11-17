#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# In-container session runner for the headless Oolite reference image.
# Reads /session/steps.txt, starts Xvfb and Oolite, runs the steps, writes
# screenshots, Latest.log and session.txt under /out.
#
# Exit codes:
#   0   ok, including when a last `sleep` is cut short by the deadline;
#   1   a step failed or Oolite died, including a `window` or `waitlog` that
#       runs out of the overall deadline (OOREF_TIMEOUT, default 300 s), and a
#       key that xdotool could not send;
#   2   a bad steps file or OOREF_TIMEOUT, refused before Oolite starts;
#   124 the overall deadline was found expired before a step.
set -u

STEPS=/session/steps.txt
OUT=/out
LOG="$OUT/logs/Latest.log"
TIMEOUT_TOTAL="${OOREF_TIMEOUT:-300}"
START_EPOCH=$(date +%s)
START_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)

RC=0
XVFB_PID=""
OOLITE_PID=""
WIN_ID=""
SHOT_SEQ=0
LOG_LINE=0 # Latest.log lines consumed by earlier successful waitlog steps.
STEP_REPORT=""
declare -a VERBS ARGS

die_usage() {
  echo "oolite-ref-session: $*" >&2
  exit 2
}

remaining() {
  local left=$((TIMEOUT_TOTAL - ($(date +%s) - START_EPOCH)))
  [ "$left" -lt 0 ] && left=0
  echo "$left"
}

# ---------------------------------------------------------------------------
# Validate the WHOLE steps file before starting anything.
# ---------------------------------------------------------------------------
[[ "$TIMEOUT_TOTAL" =~ ^[1-9][0-9]{0,4}$ ]] || die_usage "OOREF_TIMEOUT must be an integer from 1 to 99999"
[ -r "$STEPS" ] || die_usage "steps file $STEPS is not readable"
lineno=0
while IFS= read -r line || [ -n "$line" ]; do
  lineno=$((lineno + 1))
  line="${line%$'\r'}"
  trimmed="${line#"${line%%[![:space:]]*}"}"
  [ -z "$trimmed" ] && continue
  [[ "$trimmed" == \#* ]] && continue
  verb="${trimmed%%[[:space:]]*}"
  rest="${trimmed#"$verb"}"
  rest="${rest#"${rest%%[![:space:]]*}"}"
  rest="${rest%"${rest##*[![:space:]]}"}"
  case "$verb" in
    window)
      [[ -z "$rest" || "$rest" =~ ^[1-9][0-9]{0,4}$ ]] || die_usage "line $lineno: window takes an optional timeout, an integer from 1 to 99999"
      ;;
    sleep)
      [[ "$rest" =~ ^[1-9][0-9]{0,4}$ ]] || die_usage "line $lineno: sleep takes an integer number of seconds from 1 to 99999"
      ;;
    shot)
      [[ "$rest" =~ ^[A-Za-z0-9_-]+$ ]] || die_usage "line $lineno: shot NAME must match [A-Za-z0-9_-]+"
      ;;
    key)
      [ -n "$rest" ] || die_usage "line $lineno: key needs at least one keysym"
      for ks in $rest; do
        [[ "$ks" =~ ^[A-Za-z0-9_+]+$ ]] || die_usage "line $lineno: bad keysym '$ks'"
      done
      ;;
    waitlog)
      wl_timeout="${rest%%[[:space:]]*}"
      wl_text="${rest#"$wl_timeout"}"
      wl_text="${wl_text#"${wl_text%%[![:space:]]*}"}"
      [[ "$wl_timeout" =~ ^[1-9][0-9]{0,4}$ ]] || die_usage "line $lineno: waitlog takes a timeout first, an integer from 1 to 99999"
      [ -n "$wl_text" ] || die_usage "line $lineno: waitlog needs a text to wait for"
      ;;
    *)
      die_usage "line $lineno: unknown verb '$verb'"
      ;;
  esac
  VERBS+=("$verb")
  ARGS+=("$rest")
done <"$STEPS"

mkdir -p "$OUT/logs" "$OUT/screenshots" "$OUT/snapshots" "$HOME/oolite-saves" "$HOME/.local/share" || die_usage "cannot create output directories"

# ---------------------------------------------------------------------------
# Shutdown and report, on every path.
# ---------------------------------------------------------------------------
# OOLITE_PID is the AppImage launcher shell, which runs the oolite binary as a
# child (run_oolite.sh does not exec it). The TERM and KILL below therefore
# reach the launcher only; the oolite process ends when the container is torn
# down, which relies on `docker run --init` (run-remote.sh always passes it).
shutdown_all() {
  if [ -n "$OOLITE_PID" ] && kill -0 "$OOLITE_PID" 2>/dev/null; then
    sleep 3 # Oolite flushes its log every 2.0 s and has no signal handler.
    kill -TERM "$OOLITE_PID" 2>/dev/null
    for _ in $(seq 1 20); do
      kill -0 "$OOLITE_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL "$OOLITE_PID" 2>/dev/null
  fi
  if [ -n "$XVFB_PID" ]; then
    kill -TERM "$XVFB_PID" 2>/dev/null
    sleep 0.5
    kill -KILL "$XVFB_PID" 2>/dev/null
  fi
}

finish() {
  local code=$?
  # `exit N` in the main flow sets RC first; a bare signal exit uses $?.
  [ "$RC" -eq 0 ] && RC=$code
  trap - EXIT
  shutdown_all
  {
    echo "oolite_version=${OOREF_OOLITE_VERSION:-unknown}"
    echo "appimage_sha256=${OOREF_APPIMAGE_SHA256:-unknown}"
    echo "start_utc=$START_UTC"
    echo "end_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "timeout_s=$TIMEOUT_TOTAL"
    printf '%s' "$STEP_REPORT"
    echo "exit=$RC"
  } >"$OUT/session.txt" 2>/dev/null
  exit "$RC"
}
trap finish EXIT

fail() { # fail CODE MESSAGE
  RC=$1
  echo "oolite-ref-session: $2" >&2
  STEP_REPORT+="error: $2"$'\n'
  exit "$RC"
}

# ---------------------------------------------------------------------------
# Start Xvfb and Oolite.
# ---------------------------------------------------------------------------
Xvfb :99 -screen 0 1280x1024x24 -nolisten tcp -noreset >"$OUT/xvfb.log" 2>&1 &
XVFB_PID=$!
up=0
for _ in $(seq 1 40); do
  if xdpyinfo -display :99 >/dev/null 2>&1; then
    up=1
    break
  fi
  sleep 0.5
done
[ "$up" -eq 1 ] || fail 1 "Xvfb did not come up"

# The AppImage launcher (run_oolite.sh) only sets up its GNUstep config when it
# believes it runs inside an AppImage, so APPDIR/APPIMAGE are set to match the
# extracted tree. OO_DIRTYPE=xdg keeps all game data under $HOME.
APPDIR=/opt/oolite APPIMAGE=/opt/oolite/Oolite.AppImage OO_DIRTYPE=xdg \
  OO_LOGSDIR="$OUT/logs" OO_SNAPSHOTSDIR="$OUT/snapshots" OO_SAVEDIR="$HOME/oolite-saves" \
  /opt/oolite/AppRun -nosplash >"$OUT/oolite-stdout.log" 2>&1 &
OOLITE_PID=$!

# ---------------------------------------------------------------------------
# Step runner.
# ---------------------------------------------------------------------------
alive_or_fail() {
  kill -0 "$OOLITE_PID" 2>/dev/null || fail 1 "Oolite is no longer running"
}

# log_match TEXT: search only the Latest.log lines after the last consumed one
# (LOG_LINE) for the fixed string TEXT. On a hit, advance LOG_LINE to the
# matched line and return 0; otherwise return 1. It counts lines, so a hit on a
# partly flushed last line still lands on the right line number.
log_match() {
  local hit
  [ -f "$LOG" ] || return 1
  hit=$(tail -n +$((LOG_LINE + 1)) "$LOG" | grep -anF -m1 -- "$1")
  [ -n "$hit" ] || return 1
  LOG_LINE=$((LOG_LINE + ${hit%%:*}))
  return 0
}

idx=0
total=${#VERBS[@]}
while [ "$idx" -lt "$total" ]; do
  verb="${VERBS[$idx]}"
  arg="${ARGS[$idx]}"
  idx=$((idx + 1))
  left=$(remaining)
  [ "$left" -gt 0 ] || fail 124 "overall deadline of ${TIMEOUT_TOTAL}s expired before step $idx ($verb $arg)"
  alive_or_fail
  case "$verb" in
    window)
      t="${arg:-120}"
      [ "$t" -gt "$left" ] && t=$left
      # --class, not --name: the window title is _NET_WM_NAME, which xdotool
      # --name does not match here (verified on the 1.93.1-255 build).
      ids=$(timeout "$t" xdotool search --sync --onlyvisible --class oolite 2>/dev/null)
      id="${ids%%$'\n'*}"
      if [ -z "$id" ]; then
        xwininfo -root -tree >"$OUT/xwininfo.txt" 2>&1
        STEP_REPORT+="step $idx: window FAILED"$'\n'
        fail 1 "no Oolite window within ${t}s (see xwininfo.txt)"
      fi
      WIN_ID="$id"
      xdotool windowfocus --sync "$WIN_ID" >/dev/null 2>&1
      STEP_REPORT+="step $idx: window ok id=$WIN_ID"$'\n'
      ;;
    sleep)
      t="$arg"
      [ "$t" -gt "$left" ] && t=$left
      sleep "$t"
      STEP_REPORT+="step $idx: sleep $arg ok"$'\n'
      ;;
    key)
      [ -n "$WIN_ID" ] && xdotool windowfocus --sync "$WIN_ID" >/dev/null 2>&1
      # Hold each key across several frames: Oolite polls its key state once
      # per frame, and under llvmpipe a plain press-and-release is often
      # processed within one frame and lost (observed on the scenario screen).
      # shellcheck disable=SC2086 # keysyms are validated and must split.
      for ks in $arg; do
        # xdotool 3.20160805 prints "No such key name" for an unknown keysym,
        # ignores the key and may still exit 0, so check both signals.
        kerr=$(xdotool keydown "$ks" sleep 0.5 keyup "$ks" sleep 0.3 2>&1 >/dev/null)
        krc=$?
        if [ "$krc" -ne 0 ] || [[ "$kerr" == *"No such key name"* ]]; then
          STEP_REPORT+="step $idx: key $ks FAILED rc=$krc"$'\n'
          fail 1 "xdotool could not send key '$ks' (rc=$krc): ${kerr%%$'\n'*}"
        fi
      done
      STEP_REPORT+="step $idx: key $arg ok"$'\n'
      ;;
    waitlog)
      wt="${arg%%[[:space:]]*}"
      wtext="${arg#"$wt"}"
      wtext="${wtext#"${wtext%%[![:space:]]*}"}"
      [ "$wt" -gt "$left" ] && wt=$left
      found=0
      exited=0
      wl_deadline=$(($(date +%s) + wt))
      while :; do
        if log_match "$wtext"; then
          found=1
          break
        fi
        if ! kill -0 "$OOLITE_PID" 2>/dev/null; then
          # Oolite is gone; its last flush may hold the line, so look once more.
          exited=1
          log_match "$wtext" && found=1
          break
        fi
        [ "$(date +%s)" -ge "$wl_deadline" ] && break
        sleep 1
      done
      if [ "$found" -eq 1 ]; then
        STEP_REPORT+="step $idx: waitlog ok line=$LOG_LINE"$'\n'
      else
        STEP_REPORT+="step $idx: waitlog FAILED text='$wtext'"$'\n'
        if [ "$exited" -eq 1 ]; then
          fail 1 "Oolite exited before the log line appeared: $wtext"
        fi
        fail 1 "log line not found within ${wt}s: $wtext"
      fi
      ;;
    shot)
      SHOT_SEQ=$((SHOT_SEQ + 1))
      file=$(printf '%s/screenshots/%02d-%s.png' "$OUT" "$SHOT_SEQ" "$arg")
      target="${WIN_ID:-root}"
      if import -display :99 -window "$target" "$file" 2>"$OUT/import.log"; then
        STEP_REPORT+="step $idx: shot $arg ok $(stat -c %s "$file") bytes"$'\n'
      else
        STEP_REPORT+="step $idx: shot $arg FAILED"$'\n'
        fail 1 "screenshot $arg failed (see import.log)"
      fi
      ;;
  esac
done

RC=0
exit 0
