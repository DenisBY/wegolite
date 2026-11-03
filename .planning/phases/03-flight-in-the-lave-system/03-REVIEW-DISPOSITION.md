---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "`GameSession.start()` is re-entrant while the GLBs load — duplicate loops, HUDs and listeners, and a permanent RAF after teardown"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Planet terminator compares a world-space normal with an object-space sun direction"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`start()` does not re-check `disposed` after its awaits"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Only the GLB preload is inside a try — every later boot step rejects with no visible failure"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Storage default parameter is evaluated outside the `try`, so a blocked-storage browser can throw out of `loadSettings()`"
  - id: WR-05
    severity: warning
    disposition: open
    title: "The menu scene installed after the background preload is never rendered"
  - id: WR-06
    severity: warning
    disposition: open
    title: "Pausing renders the previous fixed-step pose, not the frozen one"
  - id: WR-07
    severity: warning
    disposition: open
    title: "\"Reset all settings\" does not reset the live hint controller"
  - id: IN-01
    severity: info
    disposition: open
    title: "`src/app/mode.ts` is dead code"
  - id: IN-02
    severity: info
    disposition: open
    title: "`hideFallback` and `isFallbackVisible` are unused exports"
  - id: IN-03
    severity: info
    disposition: open
    title: "`slerp` is unused"
  - id: IN-04
    severity: info
    disposition: open
    title: "`compassTargetChanged` is never emitted; its handler is unreachable"
  - id: IN-05
    severity: info
    disposition: open
    title: "`Hud.resize()` clears the canvas but leaves `drawn` true"
  - id: IN-06
    severity: info
    disposition: open
    title: "`bindAction` reports success for an invalid code without binding it"
  - id: IN-07
    severity: info
    disposition: open
    title: "A throwing disposer masks the original scene-construction error"
open: 15
total: 15
recorded: 2026-11-03T20:41:43.651Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
