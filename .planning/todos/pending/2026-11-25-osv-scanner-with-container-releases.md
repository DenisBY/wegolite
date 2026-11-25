---
created: 2026-11-25T16:00:00.000Z
title: Add OSV-Scanner once container images are built and released on GitHub
area: tooling
severity: minor
files:
  - .github/workflows/audit.yml
  - compose.yaml
  - Dockerfile
  - tools/oolite-reference/Dockerfile
---

## Trigger

Do this when the project starts building and publishing container images on GitHub (for example to ghcr.io).
Until then the images are dev/CI only and no player receives them.

## Problem

The dependency audit (`docker compose run --rm audit`, `.github/workflows/audit.yml`) is `npm audit`: it sees the
npm lockfile only. OSV-Scanner (Google, OSV.dev database) also scans container images, that is the Debian packages
in the base images, and can check licences against an allowlist.

## Decision record (2026-11-25)

Asked the reviewer models (Fable, Opus, Sonnet) whether to adopt OSV-Scanner straight away. Opus and Fable: keep
`npm audit` now, add OSV-Scanner with image releases; Sonnet: OSV-Scanner now for the lockfile and licences. The owner
chose `npm audit` now and this todo. Points all three agreed on:

- For npm packages OSV-Scanner adds little: it largely re-serves the GitHub Advisory Database that `npm audit` and
  Dependabot alerts already read.
- Scanning the dev/CI images today is mostly noise: Debian bookworm-slim carries many unfixed or won't-fix CVEs in
  images nobody receives.
- Run one scanner per lockfile, not two (duplicate findings, two ignore lists). When OSV-Scanner arrives, either use it
  for images only or let it replace `npm audit`.
- Keep it outside the verify workflow, so it never gates the Pages deploy.

## When doing it

- Run it in Docker from a pinned image, `ghcr.io/google/osv-scanner:vX.Y.Z@sha256:...`, as a compose service.
- Exit codes: 1 means findings; other non-zero codes mean errors (network, no lockfile). Do not treat both the same.
- There is no `--audit-level`; severity and accepted findings go in `osv-scanner.toml` ignore entries, each with a
  reason and an expiry date.
- Licences: check only what ships (production dependencies and the published image). Dev tools are never
  distributed and bring many licences (CC-BY-4.0, BlueOak, Python-2.0 and others), so a whole-tree allowlist is noise.
