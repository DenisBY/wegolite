#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-or-later
# Copyright (c) 2026 Wegolite contributors
#
# FOUND-01 machine check: `docker compose up app` (the documented command, run
# here in detached form) serves the game with the Vite HMR client on 5173.
#
# This script is the single authority for the dev-server reachability claim;
# compose.yaml deliberately carries no `healthcheck` for `app` (PATTERNS §7:
# pick one mechanism, do not add both).
#
# The assertion is an HTTP *body* check, not a listening-port probe: a port
# that accepts TCP but serves the wrong thing must fail. The `trap` tears the
# stack down on every exit path, including a failed assertion, so a red run
# cannot leave a stale server behind (T-01-19).

set -eu

cd "$(dirname "$0")/.."

docker compose up -d app
trap 'docker compose down' EXIT

# Waits for the HMR client by retrying the request itself (no sleep-only wait,
# no bare `nc`/port probe). Docker's port proxy accepts the TCP connection
# before Vite listens, so the first attempt is reset (`curl: (56)`) rather than
# refused; `--retry-all-errors` is what retries that case, and
# `--retry-connrefused` covers the window before the proxy itself is up.
body=$(curl -fsS --retry 30 --retry-delay 1 --retry-connrefused --retry-all-errors http://localhost:5173/)

if ! printf '%s' "$body" | grep -q '@vite/client'; then
  echo "dev smoke: 5173 responded without the Vite HMR client" >&2
  exit 1
fi

echo "dev smoke: 5173 served the HMR client"
