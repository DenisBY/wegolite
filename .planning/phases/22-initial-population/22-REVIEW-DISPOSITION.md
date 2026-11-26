---
phase: 22
review: 22-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "`buildNeighbourhood` can throw for extreme integer chart coordinates, though the arrival install block relies on it being total"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The per-entry / per-group / per-site RNG stream design (assumption A8) is a divergence with no `FIDELITY.md` row"
  - id: IN-01
    severity: info
    disposition: open
    title: "Stale contracts and comments still describe the inert populator"
  - id: IN-02
    severity: info
    disposition: open
    title: "Names and duplicated total-read helpers"
  - id: IN-03
    severity: info
    disposition: open
    title: "Latent galaxy mismatch between the arrival system and the neighbourhood list"
  - id: IN-04
    severity: info
    disposition: open
    title: "Impossible-state guards in the spawn path"
  - id: IN-05
    severity: info
    disposition: open
    title: "Station-launch and repopulator branches with no caller"
open: 7
total: 7
recorded: 2026-11-26T20:45:43.803Z
---

# Phase 22: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
