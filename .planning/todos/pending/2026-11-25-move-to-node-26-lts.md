---
created: 2026-11-25T16:10:00.000Z
title: Move the toolchain from Node 24 to Node 26 LTS in one change
area: tooling
severity: minor
files:
  - Dockerfile
  - package.json
  - package-lock.json
  - tests/contract/container-contract.test.ts
  - .github/dependabot.yml
---

## Problem

The project runs on Node 24 (`engines: ^24.0.0`, `FROM node:24-bookworm-slim@sha256:...`). Node 24 is in maintenance
LTS until April 2028, so there is no urgency. Node 26 became the active LTS line in October 2026.

Dependabot proposed the move piecemeal on 2026-11-25 and both pull requests closed:

- PR #2, `node:24-bookworm-slim` to `node:25-bookworm-slim`. Node 25 is an odd, non-LTS line, out of support since
  June 2026; Vitest 5 excludes it (`^22.12.0 || ^24.0.0 || >=26.0.0`). Its CI failed only on the container contract
  test that pins `node:24-bookworm-slim` (`container-contract.test.ts:510`), as designed.
- PR #4, `@types/node` 24 to 26. On its own it would type Node 26 APIs while the runtime is Node 24.

`.github/dependabot.yml` now ignores Node and `@types/node` major updates, so this move is made by hand.

## Solution

One change, together:

- `Dockerfile`: `node:26-bookworm-slim` (or `-trixie-slim`, decide) pinned by index digest
  (`docker buildx imagetools inspect`);
- `package.json` `engines` to `^26.0.0`; `@types/node` to the 26 major;
- the contract test's expected `FROM` line;
- `docker compose build --no-cache` and `docker compose down --volumes`;
- gates: remote `verify-full`, `e2e-cross` (Firefox), and a CI run.
