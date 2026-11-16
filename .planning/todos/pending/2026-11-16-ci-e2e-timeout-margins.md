---
created: 2026-11-16T12:00:00.000Z
title: Watch the CI e2e timeout margins and shard when the run gets long
area: tests
severity: minor
files:
  - .github/workflows/verify.yml
  - playwright.config.ts
  - compose.yaml
---

## Problem

The GitHub `verify` job (`ubuntu-latest`, 4 vCPU, `verify-full`) ran the release 0.4.0 in 23.9 minutes.
Its Chromium specs run about 2.5 to 3 times slower than on the remote test machine (for example
`hyperspace.spec.ts:194` 252 s against 90 s, `settings.spec.ts:259` 28 s against 11 s), because the
runner has no GPU and WebGL runs on SwiftShader.

Measured on that run (134 specs), the share of each test's own timeout that it used:
the largest are `probe-shape.spec.ts:286` (49% of the 30 s default), `compliance-shipped.spec.ts:111` (46%),
`scene.spec.ts:15` (46%), `autosave.spec.ts:433` (44% of 600 s) and `hyperspace.spec.ts:194` (42% of 600 s).
No test is within 40% of its timeout, so no timeout was changed. The failures seen so far came from
inner waits that depend on simulation timing (`launch.spec.ts:129`, fixed in 55bf6f6), not from the
test timeout.

## Rule

- When a spec uses 60% or more of its timeout on CI, raise the timeout (or fix the wait) in the same change.
- When the CI `verify` job passes 35 to 40 minutes, shard the browser run (`--shard=n/4` in a job matrix, each job
  with its own runner) instead of buying larger runners (paid only; self-hosted runners are unsafe on a public repo).
