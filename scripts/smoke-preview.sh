#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# FOUND-02 machine check: `docker compose up preview` (the documented command,
# run here in detached form) builds the production bundle and serves it on 4173.
#
# The `preview` service's command is `npm run build && npm run preview`, so this
# script does not build separately — `up -d preview` is what makes the served
# page the *production* bundle rather than the dev transform (FOUND-02).
#
# This script is the single authority for the preview reachability claim;
# compose.yaml deliberately carries no `healthcheck` for `preview` (PATTERNS §7).
#
# The assertion is an HTTP *body* check for the bundle's title text, not a
# listening-port probe, and the `trap` tears the stack down on every exit path
# so a red run cannot leave a stale server behind (T-01-19).

set -eu

cd "$(dirname "$0")/.."

docker compose up -d preview
trap 'docker compose down' EXIT

# The container builds before it serves, so the first requests may be refused
# or reset for several seconds. Docker's port proxy accepts the connection
# before `vite preview` listens, which surfaces as `curl: (56)` rather than a
# refusal, so `--retry-all-errors` is required alongside
# `--retry-connrefused` — and both wait instead of racing a fixed sleep.
body=$(curl -fsS --retry 30 --retry-delay 1 --retry-connrefused --retry-all-errors http://localhost:4173/)

# The marker is the release title, `Wegolite <version>`, which must equal the
# package.json version (pinned by tests/contract/container-contract.test.ts).
if ! printf '%s' "$body" | grep -qF 'Wegolite 0.1.0'; then
  echo "preview smoke: 4173 did not serve the production bundle" >&2
  exit 1
fi

echo "preview smoke: 4173 served the production bundle"
