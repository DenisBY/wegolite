#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# check-arch-determinism: the single authority for the arm64 <-> amd64
# byte-identity claim over the generated content tree (DATA-08, D-06).
#
# Why this is not in `verify`: the chain runs every stage inside one
# `docker compose run` invocation, and Compose has no per-invocation platform
# selector. Proving byte identity needs two builds from the same context, one
# under `--platform linux/arm64` and one under `--platform linux/amd64`,
# followed by an out-of-container comparison of the two generated trees. That
# is a separate, deliberately manual/CI-only job; `assets:check` inside
# `verify` only proves determinism on the host architecture.
#
# What it does: builds the `deps` stage (not `ci`, which would install
# Chromium under QEMU) for both platforms from the same pinned base digest,
# regenerates the content in an isolated tree under each image, then compares
# the file set, each file's bytes, each file's SHA-256, and the two
# `manifest.json` files. A difference exits 1 and names every path. An
# environment that cannot run the comparison exits 2 with the missing
# capability named, so an unrunnable check is never recorded as a pass.
#
# EXCLUSIONS
# (none)
#
# There is no override: no force flag, no allow-list flag, no environment
# variable and no per-file skip path. A real difference is a bug in the writer (the
# anticipated one is the zlib-compressed emissive PNG; the documented fallback
# is PNG filter 0 plus stored, uncompressed deflate blocks). If a genuine
# architecture-dependent field ever exists, it must be written here with its
# justification so it is reviewed in the diff, never added as a bypass.
#
# Result: not yet measured — run this script on an arm64-emulation host or the
# CI arm64 runner to record the outcome.
#
# Invocation on a CI arm64 runner (or any host with QEMU binfmt registered):
#   sh scripts/check-arch-determinism.sh

set -eu

cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
# Remove the isolated output trees on every exit path, including the failure
# exits below. Nothing the script creates outside `$tmp` needs cleanup.
trap 'rm -rf "$tmp"' EXIT

# Exit 2 is reserved for "the environment cannot run the comparison". Exit 1 is
# reserved for a genuine byte difference. They must never be conflated.
fail_env() {
  echo "check-arch-determinism: cannot run: $1" >&2
  exit 2
}

# --- preflight -------------------------------------------------------------

if ! docker buildx version >"$tmp/buildx.log" 2>&1; then
  fail_env "docker buildx is not available ($(tail -n 1 "$tmp/buildx.log"))"
fi

# The pinned Node base is read from the Dockerfile so there is exactly one
# source of truth for the image both builds use.
pinned=$(sed -n 's/^FROM \(node:[^ ]*@sha256:[0-9a-f]*\) AS base$/\1/p' Dockerfile | head -n 1)
[ -n "$pinned" ] ||
  fail_env "Dockerfile has no digest-pinned 'node:...@sha256:...' base stage"

# amd64 is the host architecture here: if even this fails, the digest reference
# or Docker itself is broken, which is an environment failure, not a result.
if ! docker run --rm --platform linux/amd64 "$pinned" true \
  >"$tmp/probe-amd64.log" 2>&1; then
  fail_env "linux/amd64 cannot run the pinned image ($(tail -n 1 "$tmp/probe-amd64.log"))"
fi

# No QEMU binfmt for linux/arm64 is the expected reason this exits 2 on an
# x86_64 development host.
if ! docker run --rm --platform linux/arm64 "$pinned" true \
  >"$tmp/probe-arm64.log" 2>&1; then
  fail_env "linux/arm64 execution is unavailable, no QEMU binfmt ($(tail -n 1 "$tmp/probe-arm64.log"))"
fi

# --- build the deps stage for both platforms from one context ---------------

docker buildx build --platform linux/arm64 --target deps \
  -t wegolite-determinism:arm64 --load . >"$tmp/build-arm64.log" 2>&1 ||
  fail_env "docker buildx build --platform linux/arm64 --target deps failed ($(tail -n 1 "$tmp/build-arm64.log"))"

docker buildx build --platform linux/amd64 --target deps \
  -t wegolite-determinism:amd64 --load . >"$tmp/build-amd64.log" 2>&1 ||
  fail_env "docker buildx build --platform linux/amd64 --target deps failed ($(tail -n 1 "$tmp/build-amd64.log"))"

# --- regenerate in an isolated tree under each architecture -----------------

for arch in arm64 amd64; do
  out="$tmp/out-$arch"
  mkdir -p "$out"
  # The generator writes relative to its own cwd, so both runs work in a
  # throwaway copy and never touch the real working tree. `third_party` and the
  # `package.json` module type are copied; `node_modules` is the image's own.
  if ! docker run --rm --platform "linux/$arch" \
    -v "$PWD:/src:ro" \
    -v "$out:/out" \
    -w /out \
    "wegolite-determinism:$arch" \
    sh -lc '
      set -eu
      cp /src/package.json /src/tsconfig.json /out/
      cp -R /src/tools /src/src /src/third_party /out/
      ln -s /app/node_modules /out/node_modules
      rm -rf /out/src/content/generated /out/public/models /out/public/textures
      cd /out
      /app/node_modules/.bin/tsx tools/oolite-ingest/cli.ts
    ' >"$tmp/$arch.log" 2>&1; then
    echo "check-arch-determinism: generation failed for linux/$arch" >&2
    tail -n 40 "$tmp/$arch.log" >&2
    exit 2
  fi
done

# --- compare ---------------------------------------------------------------

# The comparison below is `diff -r`'s semantic restricted to the two generated
# roots (`src/content/generated` and `public`), done per file rather than by
# parsing diff's binary/only-in wording, so every difference can be named with
# its class.
list_emitted() {
  # $1 = repository-relative tree root
  ( cd "$1" && find src/content/generated public -type f -print 2>/dev/null | sort )
}

list_emitted "$tmp/out-arm64" >"$tmp/files-arm64.txt"
list_emitted "$tmp/out-amd64" >"$tmp/files-amd64.txt"

diffs=0
count=0

# File-set differences: a path present on only one side is a named failure.
if ! diff -u "$tmp/files-arm64.txt" "$tmp/files-amd64.txt" >"$tmp/files.diff" 2>&1; then
  while IFS= read -r line; do
    case "$line" in
      ---* | +++* | @@*) continue ;;
      -*) printf 'check-arch-determinism: DIFF %s (missing)\n' "${line#-}" >&2 ;;
      +*) printf 'check-arch-determinism: DIFF %s (extra)\n' "${line#+}" >&2 ;;
    esac
  done <"$tmp/files.diff"
  diffs=1
fi

# Byte and per-file SHA-256 comparison over the shared set. A SHA-256 list is
# compared as a second instrument so a byte-equal-but-hash-different result
# cannot pass unnoticed.
while IFS= read -r path; do
  [ -n "$path" ] || continue
  left="$tmp/out-arm64/$path"
  right="$tmp/out-amd64/$path"
  [ -f "$right" ] || continue
  count=$((count + 1))
  if ! cmp -s "$left" "$right"; then
    printf 'check-arch-determinism: DIFF %s (bytes)\n' "$path" >&2
    diffs=1
  fi
  left_hash=$(sha256sum "$left" | cut -d' ' -f1)
  right_hash=$(sha256sum "$right" | cut -d' ' -f1)
  if [ "$left_hash" != "$right_hash" ]; then
    printf 'check-arch-determinism: DIFF %s (bytes)\n' "$path" >&2
    diffs=1
  fi
done <"$tmp/files-arm64.txt"

# The manifest is compared explicitly as well: it is the index by which every
# other byte is identified, so a divergence there is reported as `manifest`.
manifest=src/content/generated/manifest.json
if [ -f "$tmp/out-arm64/$manifest" ] && [ -f "$tmp/out-amd64/$manifest" ]; then
  if ! cmp -s "$tmp/out-arm64/$manifest" "$tmp/out-amd64/$manifest"; then
    printf 'check-arch-determinism: DIFF %s (manifest)\n' "$manifest" >&2
    diffs=1
  fi
else
  printf 'check-arch-determinism: DIFF %s (missing)\n' "$manifest" >&2
  diffs=1
fi

if [ "$diffs" -ne 0 ]; then
  echo "check-arch-determinism: arm64 and amd64 output differ" >&2
  exit 1
fi

echo "check-arch-determinism: arm64 and amd64 output are byte-identical ($count files)"
