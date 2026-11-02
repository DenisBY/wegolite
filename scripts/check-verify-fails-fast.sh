#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# FOUND-03 negative proof: `docker compose run --rm verify` must go non-zero at
# the *first* failing stage, not run the later stages anyway and not swallow the
# exit code. A green chain is only meaningful if a red one is red.
#
# The seed is a `three` import inside `src/sim/`, which `eslint.config.js`
# rejects with an error-severity `no-restricted-imports` ("src/sim must stay
# renderer-free."). That is the same violation plan 01-02's own gate
# demonstrates firing under `npm run lint`; an unused local constant would not
# do, because `@typescript-eslint/no-unused-vars` exempts exported declarations.
#
# The script requires BOTH facts — a non-zero exit AND output naming the probe
# file or the rule — so a failure for an unrelated reason (a missing image, a
# network error) cannot be mistaken for the failure this rehearsal is about.
#
# It is a rehearsal tool run by a human or by the plan's `<verify>`, never part
# of `verify` itself: adding it there would recurse.

set -eu

cd "$(dirname "$0")/.."

probe=src/sim/__verify_probe.ts
mkdir -p src/sim

# Registered before the seed exists, so cleanup survives an early failure
# anywhere below. The trap leaves the tree exactly as it was found.
trap 'rm -f src/sim/__verify_probe.ts' EXIT

printf '%s\n' \
  'import * as THREE from "three";' \
  '' \
  'export const probe = new THREE.Vector3(1, 2, 3);' \
  >"$probe"

# `set -e` would abort on the expected non-zero status, so it is disabled for
# exactly this one command and the status captured explicitly.
set +e
output=$(docker compose run --rm verify 2>&1)
status=$?
set -e

printf '%s\n' "$output"

if [ "$status" -eq 0 ]; then
  echo "check-verify-fails-fast: verify exited 0 with a seeded sim-zone violation" >&2
  echo "check-verify-fails-fast: the chain is not fail-fast" >&2
  exit 1
fi

if ! printf '%s' "$output" | grep -Eq 'no-restricted-imports|__verify_probe'; then
  echo "check-verify-fails-fast: verify exited ${status} but the output never names" >&2
  echo "check-verify-fails-fast: the seeded probe or no-restricted-imports" >&2
  exit 1
fi

echo "verify failed fast at lint as expected"
