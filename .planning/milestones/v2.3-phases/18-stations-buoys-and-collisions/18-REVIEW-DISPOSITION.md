---
phase: 18
review: 18-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Blast unit vector rounds `1/sqrt` once, Oolite rounds twice (header claim of step-by-step float fidelity is false)"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Response fixtures are generated from `reference.ts` and re-checked by `reference.ts`; hand anchors cover a small slice"
  - id: IN-01
    severity: info
    disposition: open
    title: "The buoy-subentity contact branch of the collision stage cannot occur with the production hull table"
  - id: IN-02
    severity: info
    disposition: open
    title: "`positionOf` falls back to the player's position for a buoy collider without a layout"
  - id: IN-03
    severity: info
    disposition: open
    title: "`resolveShotHits` doc says its one world write is the buoy flag; it writes more"
  - id: IN-04
    severity: info
    disposition: open
    title: "The `proximity.ts` rationale for buoy-only prefiltering contradicts the todo's own measurement"
  - id: IN-05
    severity: info
    disposition: open
    title: "Several lane tests log or record instead of asserting, and one export is test-only"
  - id: IN-06
    severity: info
    disposition: open
    title: "`debris.ts` module header still says debris is not a laser, ident or scanner candidate"
  - id: IN-07
    severity: info
    disposition: open
    title: "`sorted-lists.ts` states Oolite keeps insertion order for equal edges; the C inserts the newcomer before equal edges"
  - id: IN-08
    severity: info
    disposition: open
    title: "`player-braking.oracle.test.ts` re-implements the flight step instead of driving it"
  - id: IN-09
    severity: info
    disposition: open
    title: "Overlong comment lines left by the Phase 18 edits"
  - id: IN-10
    severity: info
    disposition: open
    title: "FIDELITY.md rows keep stale Wegolite line pointers after this phase moved the functions"
  - id: IN-11
    severity: info
    disposition: open
    title: "Ragged comment reflow left by the phase edits"
  - id: IN-12
    severity: info
    disposition: open
    title: "The dock tolerance derivation is not a bound for oblique planes, and one fixture uses 74 percent of it"
  - id: IN-13
    severity: info
    disposition: open
    title: "The dock-mouth consumer discards the oracle's own octree answer and accepts a 4x slack"
  - id: IN-14
    severity: info
    disposition: open
    title: "Dead code in the oracle tree"
  - id: IN-15
    severity: info
    disposition: open
    title: "`derive.ts` header misstates its imports"
open: 17
total: 17
recorded: 2026-11-20T17:36:29.239Z
---

# Phase 18: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
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
| IN-13 | info | open | - |
| IN-14 | info | open | - |
| IN-15 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
