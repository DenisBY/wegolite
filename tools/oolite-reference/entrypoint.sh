#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# In-container session runner for the headless Oolite reference image.
# Reads /session/steps.txt, starts Xvfb and Oolite, runs the steps, writes
# screenshots, Latest.log and session.txt under /out.
#
# Exit codes: 0 ok, 1 a step failed or Oolite died, 2 bad steps file,
# 124 overall deadline (OOREF_TIMEOUT, default 300 s) expired.
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
[[ "$TIMEOUT_TOTAL" =~ ^[0-9]+$ ]] || die_usage "OOREF_TIMEOUT must be an integer"
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
      [[ -z "$rest" || "$rest" =~ ^[0-9]+$ ]] || die_usage "line $lineno: window takes an optional integer timeout"
      ;;
    sleep)
      [[ "$rest" =~ ^[0-9]+$ ]] || die_usage "line $lineno: sleep takes an integer number of seconds"
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
      [[ "$wl_timeout" =~ ^[0-9]+$ ]] || die_usage "line $lineno: waitlog takes an integer timeout first"
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
      # shellcheck disable=SC2086 # keysyms are validated and must split.
      xdotool key --delay 150 $arg
      STEP_REPORT+="step $idx: key $arg ok"$'\n'
      ;;
    waitlog)
      wt="${arg%%[[:space:]]*}"
      wtext="${arg#"$wt"}"
      wtext="${wtext#"${wtext%%[![:space:]]*}"}"
      [ "$wt" -gt "$left" ] && wt=$left
      found=0
      for _ in $(seq 0 "$wt"); do
        if [ -f "$LOG" ] && grep -qF -- "$wtext" "$LOG"; then
          found=1
          break
        fi
        kill -0 "$OOLITE_PID" 2>/dev/null || break
        sleep 1
      done
      if [ "$found" -eq 1 ]; then
        STEP_REPORT+="step $idx: waitlog ok"$'\n'
      else
        STEP_REPORT+="step $idx: waitlog FAILED text='$wtext'"$'\n'
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
