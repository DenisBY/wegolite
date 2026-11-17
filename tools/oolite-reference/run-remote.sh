#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# Run one headless Oolite 1.93.1-255 reference session on the remote test
# machine and fetch the screenshots and Latest.log back, outside the repo.
# See tools/oolite-reference/README.md.
#
# Usage: run-remote.sh [--out DIR] [--steps FILE] [--timeout SECONDS]
#                      [--addons DIR] [--no-build]
#
# Exit codes:
#   the container's code (as in entrypoint.sh): 0 ok, 1 a step failed or Oolite
#     died, 2 bad steps file or OOREF_TIMEOUT, 124 the deadline was found
#     expired between steps;
#   124 also when the outer backstop (--timeout + 120 s) fired; the named
#     container is then removed with `docker rm -f`;
#   125 when `docker run` itself failed (daemon error, or no image with
#     --no-build);
#   255 when ssh failed during the run;
#   64 a usage error, a bad --timeout or a refused output directory;
#   70 a sync, build, session-setup or fetch failure. A failed fetch keeps the
#     remote session directory and prints its path.
set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
H="${OOREF_HOST:-opencode@192.168.178.51}"
IMAGE=wegolite-oolite-reference:1.93.1-255

STEPS="$SCRIPT_DIR/steps/title.steps"
TIMEOUT=300
ADDONS=""
OUT=""
BUILD=1

usage() {
  echo "usage: $0 [--out DIR] [--steps FILE] [--timeout SECONDS] [--addons DIR] [--no-build]" >&2
  exit 64
}

while [ $# -gt 0 ]; do
  case "$1" in
    --out) [ $# -ge 2 ] || usage; OUT="$2"; shift 2 ;;
    --steps) [ $# -ge 2 ] || usage; STEPS="$2"; shift 2 ;;
    --timeout) [ $# -ge 2 ] || usage; TIMEOUT="$2"; shift 2 ;;
    --addons) [ $# -ge 2 ] || usage; ADDONS="$2"; shift 2 ;;
    --no-build) BUILD=0; shift ;;
    *) usage ;;
  esac
done

[[ "$TIMEOUT" =~ ^[1-9][0-9]{0,4}$ ]] || { echo "--timeout must be an integer from 1 to 99999" >&2; exit 64; }
[ -f "$STEPS" ] || { echo "steps file not found: $STEPS" >&2; exit 64; }

# Output guard: never inside the repository, never into a non-empty directory.
if [ -z "$OUT" ]; then
  BASE="${CLAUDE_JOB_DIR:+$CLAUDE_JOB_DIR/tmp}"
  OUT="${BASE:-/tmp}/oolite-reference/$(date -u +%Y%m%dT%H%M%SZ)"
fi
OUT=$(realpath -m -- "$OUT")
TOP=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)
if [ -n "$TOP" ] && { [ "$OUT" = "$TOP" ] || [[ "$OUT" == "$TOP"/* ]]; }; then
  echo "refusing output directory inside the repository: $OUT" >&2
  exit 64
fi
if [ -e "$OUT" ] && [ -n "$(ls -A -- "$OUT" 2>/dev/null)" ]; then
  echo "refusing non-empty output directory: $OUT" >&2
  exit 64
fi

ADDON_NAMES=""
if [ -n "$ADDONS" ]; then
  [ -d "$ADDONS" ] || { echo "--addons directory not found: $ADDONS" >&2; exit 64; }
  ADDONS=$(realpath -- "$ADDONS")
  ADDON_NAMES=$(cd "$ADDONS" && ls -d -- *.oxp 2>/dev/null | tr '\n' ' ')
  [ -n "$ADDON_NAMES" ] || { echo "--addons directory has no *.oxp child: $ADDONS" >&2; exit 64; }
fi

T0=$(date +%s)
RHOME=$(ssh -o BatchMode=yes "$H" 'printf %s "$HOME"') || { echo "ssh failed" >&2; exit 70; }
RDIR="$RHOME/oolite-reference"
RRUNS="$RHOME/oolite-reference-runs"

# Sync the working-tree copy of the tool (tar over ssh, atomic swap).
ssh "$H" "rm -rf $(printf %q "$RDIR.tmp") && mkdir -p $(printf %q "$RDIR.tmp")" &&
  tar -C "$SCRIPT_DIR" -cf - Dockerfile entrypoint.sh steps |
  ssh "$H" "tar -x -C $(printf %q "$RDIR.tmp") && rm -rf $(printf %q "$RDIR") && mv $(printf %q "$RDIR.tmp") $(printf %q "$RDIR")" ||
  { echo "sync failed"; exit 70; }

if [ "$BUILD" -eq 1 ]; then
  RUID=$(ssh "$H" id -u) && RGID=$(ssh "$H" id -g) || { echo "sync failed"; exit 70; }
  ssh "$H" "docker build --build-arg OOREF_UID=$(printf %q "$RUID") --build-arg OOREF_GID=$(printf %q "$RGID") -t $IMAGE $(printf %q "$RDIR")" ||
    { echo "image build failed"; exit 70; }
fi

# Per-run session directory on the remote.
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
SESSION=$(ssh "$H" "mkdir -p $(printf %q "$RRUNS") && mktemp -d $(printf %q "$RRUNS/$STAMP")-XXXXXX") || { echo "session setup failed"; exit 70; }
ssh "$H" "mkdir -p $(printf %q "$SESSION/out") && cat > $(printf %q "$SESSION/steps.txt")" <"$STEPS" || { echo "session setup failed"; exit 70; }

# A unique name (the remote mktemp suffix) lets the backstop below remove the
# container if the outer timeout kills ssh before the container finishes.
NAME="ooref-${SESSION##*/}"
RUN_ARGS="--name $(printf %q "$NAME") --rm --init --network none -e OOREF_TIMEOUT=$(printf %q "$TIMEOUT")"
RUN_ARGS="$RUN_ARGS -v $(printf %q "$SESSION/out"):/out -v $(printf %q "$SESSION/steps.txt"):/session/steps.txt:ro"
if [ -n "$ADDONS" ]; then
  tar -C "$ADDONS" -cf - $(printf '%q ' $ADDON_NAMES) |
    ssh "$H" "mkdir -p $(printf %q "$SESSION/addons") && tar -x -C $(printf %q "$SESSION/addons")" || { echo "addons sync failed"; exit 70; }
  RUN_ARGS="$RUN_ARGS -v $(printf %q "$SESSION/addons"):/addons:ro -e OO_ADDITIONALADDONSDIRS=/addons"
fi

# -n: the container needs no stdin, and GNU timeout runs ssh in a background
# process group, where an ssh that reads the terminal would be stopped (SIGTTIN).
timeout $((TIMEOUT + 120)) ssh -n "$H" "docker run $RUN_ARGS $IMAGE"
RC=$?
if [ "$RC" -eq 124 ]; then
  # The container's own deadline also exits 124; then --rm already removed it
  # and the rm below is a harmless no-op.
  ssh -n "$H" "docker rm -f $(printf %q "$NAME")" >/dev/null 2>&1 || true
  echo "deadline or outer backstop ended the run (exit 124); container $NAME was removed if it was still running" >&2
fi

# Fetch whatever exists, whatever the exit code. A failed fetch keeps the
# remote session directory so the outputs are not lost.
FETCH=ok
mkdir -p -- "$OUT" || FETCH=failed
if [ "$FETCH" = ok ]; then
  ssh "$H" "tar -C $(printf %q "$SESSION/out") -cf - ." | tar -m -x -C "$OUT" || FETCH=failed
fi
IMAGE_ID=$(ssh "$H" "docker image inspect --format '{{.Id}}' $IMAGE" 2>/dev/null || echo unknown)
FINAL=$RC
if [ "$FETCH" = ok ]; then
  ssh "$H" "rm -rf $(printf %q "$SESSION")" || true
else
  echo "fetch failed; remote outputs kept at ${H}:${SESSION}" >&2
  echo "recover: ssh $H tar -C $(printf %q "$SESSION/out") -cf - . | tar -x -C <empty local dir>, then ssh $H rm -rf $(printf %q "$SESSION")" >&2
  FINAL=70
fi

ELAPSED=$(($(date +%s) - T0))
GIT_SHA=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)
GIT_DIRTY=clean
[ -n "$(git -C "$SCRIPT_DIR" status --porcelain -- . 2>/dev/null)" ] && GIT_DIRTY=dirty
{
  echo "git_sha=$GIT_SHA"
  echo "tool_tree=$GIT_DIRTY"
  echo "host=$H"
  echo "image=$IMAGE"
  echo "image_id=$IMAGE_ID"
  echo "steps=$(basename "$STEPS")"
  echo "addons=$ADDON_NAMES"
  echo "container_exit=$RC"
  echo "fetch=$FETCH"
  echo "container=$NAME"
  echo "elapsed_s=$ELAPSED"
} >"$OUT/wrapper.txt" || echo "warning: could not write $OUT/wrapper.txt" >&2

echo "exit=$FINAL container_exit=$RC elapsed=${ELAPSED}s out=$OUT"
exit "$FINAL"
