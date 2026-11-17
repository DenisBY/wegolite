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
# Exit codes: the container's exit code (0 ok, 1 step failed or Oolite died,
# 2 bad steps file, 124 deadline), 64 usage or refused output dir, 70 sync or
# build failure.
set -u

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

[[ "$TIMEOUT" =~ ^[0-9]+$ ]] || { echo "--timeout must be an integer" >&2; exit 64; }
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

RUN_ARGS="--rm --init --network none -e OOREF_TIMEOUT=$(printf %q "$TIMEOUT")"
RUN_ARGS="$RUN_ARGS -v $(printf %q "$SESSION/out"):/out -v $(printf %q "$SESSION/steps.txt"):/session/steps.txt:ro"
if [ -n "$ADDONS" ]; then
  tar -C "$ADDONS" -cf - $(printf '%q ' $ADDON_NAMES) |
    ssh "$H" "mkdir -p $(printf %q "$SESSION/addons") && tar -x -C $(printf %q "$SESSION/addons")" || { echo "addons sync failed"; exit 70; }
  RUN_ARGS="$RUN_ARGS -v $(printf %q "$SESSION/addons"):/addons:ro -e OO_ADDITIONALADDONSDIRS=/addons"
fi

ssh "$H" "docker run $RUN_ARGS $IMAGE"
RC=$?

# Fetch whatever exists, whatever the exit code.
mkdir -p "$OUT"
ssh "$H" "tar -C $(printf %q "$SESSION/out") -cf - ." | tar -m -x -C "$OUT" || echo "warning: fetch failed" >&2
IMAGE_ID=$(ssh "$H" "docker image inspect --format '{{.Id}}' $IMAGE" 2>/dev/null || echo unknown)
ssh "$H" "rm -rf $(printf %q "$SESSION")" || true

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
  echo "elapsed_s=$ELAPSED"
} >"$OUT/wrapper.txt"

echo "exit=$RC elapsed=${ELAPSED}s out=$OUT"
exit "$RC"
