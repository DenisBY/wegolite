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
    disposition: fixed
    title: "Stale contracts and comments still describe the inert populator"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "Names and duplicated total-read helpers"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Latent galaxy mismatch between the arrival system and the neighbourhood list"
  - id: IN-04
    severity: info
    disposition: fixed
    title: "Impossible-state guards in the spawn path"
  - id: IN-05
    severity: info
    disposition: skipped
    title: "Station-launch and repopulator branches with no caller"
open: 2
total: 7
recorded: 2026-11-26T21:46:34.767Z
---

# Phase 22: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | fixed | 22-REVIEW-FIX.md |
| IN-02 | info | fixed | 22-REVIEW-FIX.md |
| IN-03 | info | fixed | 22-REVIEW-FIX.md |
| IN-04 | info | fixed | 22-REVIEW-FIX.md |
| IN-05 | info | skipped | 22-REVIEW-FIX.md |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
