# Phase 1: Foundation, Containers & Compliance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-02
**Phase:** 1-Foundation, Containers & Compliance
**Areas discussed:** Container topology & verify chain, Visible Phase 1 deliverable, Determinism harness

---

## Container topology & verify chain

### Image structure

| Option | Description | Selected |
|--------|-------------|----------|
| One multi-stage Dockerfile with targets | Single Dockerfile with named stages; Compose picks via `build.target` | ✓ |
| Separate Dockerfile per concern | Dockerfile.dev / .ci / .preview; short files but versions drift by hand | |
| One image for everything | One image, entrypoint branches between Vite dev and static preview | |

**User's choice:** One multi-stage Dockerfile with targets
**Notes:** Chosen for a single dependency layer shared by every service and one place to bump Node/Playwright.

### Browser base

| Option | Description | Selected |
|--------|-------------|----------|
| node:24-bookworm-slim + baked Chromium | One Node 24 baseline; `playwright install --with-deps chromium` at build time | ✓ |
| Playwright base image for browser stages | Maintained browser/OS pairing, but its Node version is dictated by the tag | |
| Playwright image for everything | One base, but dev/preview carry ~1 GB of unused browser packages | |

**User's choice:** node:24-bookworm-slim + baked Chromium
**Notes:** Preserves the `^24` engines field and satisfies FOUND-04 without test-time downloads.

### Verify execution

| Option | Description | Selected |
|--------|-------------|----------|
| One service, shell chain with fail-fast | `lint → typecheck → test → build → e2e` under `set -e` in one container | ✓ |
| Compose depends_on fan-in | Parallel services wired by dependencies; no single aggregated exit status | |
| Node orchestration script | `tools/verify.ts` with summary output; reimplements CI in-repo | |

**User's choice:** One service, shell chain with fail-fast
**Notes:** Matches the roadmap's "single chain" wording and keeps `verify` one command with one status.

### Working-tree mount

| Option | Description | Selected |
|--------|-------------|----------|
| Bind-mount repo, named volume over node_modules | `.:/app` plus a named volume so image-built dependencies win | ✓ |
| Bind-mount only source and config files | Narrower mount; every new top-level path needs a compose edit | |
| Copy at build, rebuild to see changes | Maximum reproducibility; breaks hot reload (FOUND-01) | |

**User's choice:** Bind-mount repo, named volume over node_modules

---

## Visible Phase 1 deliverable

### What loads

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal game shell with canvas | Canvas, title/status overlay, marker, dev stats overlay, disclaimer footer | ✓ |
| Bare canvas, precision scene only | Renderer and marker with no chrome and no disclaimer home | |
| Title screen shell first | Menu with disabled "New game" and credits; builds Phase 3/5 UI early | |

**User's choice:** Minimal game shell with canvas

### Precision scene placement

| Option | Description | Selected |
|--------|-------------|----------|
| Default view, always visible | Marker at 1.4e6 m renders on every load alongside a starfield | ✓ |
| Behind a dev route or query flag | Clean default view; proof only found by developers | |
| Test-only, not in the app | Smallest app surface; no user-visible demonstration | |

**User's choice:** Default view, always visible

### Precision proof

| Option | Description | Selected |
|--------|-------------|----------|
| Numeric transform test + render smoke test | Float64 subtraction and ULP assertions in Node; Playwright asserts draw calls and no console errors | ✓ |
| Screenshot comparison of the marker | Directly visual, but flaky across GPUs/drivers | |
| Manual visual verification | Honest but no regression protection | |

**User's choice:** Numeric transform test + render smoke test

### Placeholder geometry

| Option | Description | Selected |
|--------|-------------|----------|
| Far marker + near body for depth separation | Wireframe cube at 1.4e6 m plus a ~500 m box at ~100 km | ✓ |
| Only the far marker | Proves precision but gives nothing to z-fight against | |
| Placeholder ship and station silhouettes | More representative, but throwaway modelling replaced in Phase 2 | |

**User's choice:** Far marker + near body for depth separation

---

## Determinism harness

### Simulation content

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal kinematic probe | Position/velocity/quaternion from a scripted input log, no Oolite constants | ✓ |
| Real flight skeleton with Oolite constants | Closer to final sim; front-runs Phase 3 tuning and Phase 2 content | |
| Abstract scalar integrator | Cheapest proof; never exercises quaternions or the float64 path | |

**User's choice:** Minimal kinematic probe

### Cadence test

| Option | Description | Selected |
|--------|-------------|----------|
| Replay one input log at 30/60/144 Hz | Synthetic frame deltas, identical final state hash required | ✓ |
| Compare every intermediate tick | Stronger diagnostics, but the hash already proves end-state equality | |
| Unit-test the accumulator arithmetic only | Fast, but never runs the simulation | |

**User's choice:** Replay one input log at 30/60/144 Hz

### Expected-result format

| Option | Description | Selected |
|--------|-------------|----------|
| FNV-1a over canonical numeric text, checked-in fixtures | Small in-repo hash, input scripts and hashes in `tests/golden/` | ✓ |
| SHA-256 via node:crypto | Stronger, but the harness is a change detector and ties the helper to Node | |
| Vitest inline snapshots | Convenient, but snapshots update too easily and drift from the input | |

**User's choice:** FNV-1a over canonical numeric text, checked-in fixtures

### Harness environment

| Option | Description | Selected |
|--------|-------------|----------|
| Node-only Vitest with a fake clock | Milliseconds per run, no GPU; browser covered by Playwright smoke | ✓ |
| Node plus Vitest browser mode | Proves cross-environment equality the project does not claim | |
| Playwright only | Tests real wiring, but pays browser startup for pure math | |

**User's choice:** Node-only Vitest with a fake clock

---

## the agent's Discretion

- **Licence and trademark artifacts** — area not selected for discussion. Planner decides wording, source-offer link, and `ASSETS.md` shape within `FOUND-06` and PROJECT.md licence constraints; disclaimer placement in the shell footer was decided during the deliverable discussion.
- **Import-zone enforcement mechanism** — ESLint `no-restricted-imports`, import-plugin zones, or `dependency-cruiser`; must fail `lint`.
- **TypeScript strictness extras** — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`.
- **`test` service scope** — Node unit project only in Phase 1; browser-mode Vitest arrives with DOM screens in Phase 5.
- **Ports, `.env.example`, README command table.**
- **Whether lint/format also run in a git hook** — `verify` stays authoritative.

## Deferred Ideas

None. Discussion stayed within phase scope.
