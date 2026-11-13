---
phase: 01
review: 01-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "The documented `VITE_USE_POLLING` opt-in never reaches the container"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`.env*` files are neither git-ignored nor docker-ignored, so `COPY . .` can bake local secrets into the image"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`Date()` bypasses the \"no wall clock in `src/sim`\" gate"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Vitest's 5 s default timeout makes the 30 s/180 s budgets in the tests unreachable"
  - id: WR-05
    severity: warning
    disposition: open
    title: "The fail-fast rehearsal can report success when lint never caught the seeded violation"
  - id: WR-06
    severity: warning
    disposition: open
    title: "A bare `docker compose up` starts all seven services, including three concurrent builds into the same bind-mounted `dist/`"
  - id: WR-07
    severity: warning
    disposition: open
    title: "The guard tests write probe files into the shared bind-mounted source tree"
  - id: WR-08
    severity: warning
    disposition: open
    title: "The Dockerfile's `# syntax` directive pulls an unpinned external image, and `--with-deps` installs unpinned OS packages"
  - id: WR-09
    severity: warning
    disposition: open
    title: "A zero-size viewport at boot publishes `ready: true` with `renders: 0` and no paint"
  - id: WR-10
    severity: warning
    disposition: open
    title: "`renders` resets to 0 on WebGL context restore, so the field is not monotonic and the new spec can time out"
  - id: WR-11
    severity: warning
    disposition: open
    title: "The resize spec samples the buffer and counter after the fact, so it cannot detect a render-before-setSize ordering"
  - id: IN-01
    severity: info
    disposition: open
    title: "`f32Ulp` returns the wrong spacing for float32 subnormals"
  - id: IN-02
    severity: info
    disposition: open
    title: "The debug probe is published unconditionally in the production bundle"
  - id: IN-03
    severity: info
    disposition: open
    title: "`package.json` declares no licence"
  - id: IN-04
    severity: info
    disposition: open
    title: "No `.gitattributes`; the raw-byte LICENSE checksum breaks on a CRLF checkout"
  - id: IN-05
    severity: info
    disposition: open
    title: "Container builds create root-owned artifacts on the host bind mount"
  - id: IN-06
    severity: info
    disposition: open
    title: "`stop()` ignores `signalCode` and has a check-then-listen race"
  - id: IN-07
    severity: info
    disposition: open
    title: "The e2e \"precision\" assertions read values the page computed, not the rendered result"
  - id: IN-08
    severity: info
    disposition: open
    title: "`oneSecondAt` swallows every error, not just the expected exhaustion"
  - id: IN-09
    severity: info
    disposition: open
    title: "`playwright.config.ts` uses `npx` for the web server"
  - id: IN-10
    severity: info
    disposition: open
    title: "The smoke scripts install their teardown trap after `docker compose up -d`"
  - id: IN-11
    severity: info
    disposition: open
    title: "The spec proves \"at least one render per resize\", not \"exactly one\""
  - id: IN-12
    severity: info
    disposition: open
    title: "The spec derives the expected buffer size from the live `devicePixelRatio`, but the renderer pins the pixel ratio at boot"
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Window resize resizes the drawing buffer but never repaints the scene"
open: 23
total: 24
recorded: 2026-11-02T22:03:25.981Z
---

# Phase 01: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| WR-08 | warning | open | - |
| WR-09 | warning | open | - |
| WR-10 | warning | open | - |
| WR-11 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| IN-09 | info | open | - |
| IN-10 | info | open | - |
| IN-11 | info | open | - |
| IN-12 | info | open | - |
| CR-01 | critical | fixed | 01-07-PLAN.md (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
