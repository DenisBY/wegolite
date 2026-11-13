---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "Bulk buys ignore the tonnes already held, so the hold can exceed capacity"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "`MarketRow.selectable` and the session's navigation predicate disagree for zero-stock rows"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "The money-safety property test does not assert the hold invariant, which is why CR-01 passes"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "Stale comment says `isEncodedSaveValid` ignores the allow-lists, but it consults them"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "Dead exports introduced by the phase"
  - id: IN-03
    severity: info
    disposition: deferred
    title: "The missile-removal confirmation states only the fee, not the net trade-in"
  - id: IN-04
    severity: info
    disposition: deferred
    title: "Fixed `waitForTimeout` calls weaken the inert-key browser proofs"
open: 0
total: 7
recorded: 2026-11-06T13:22:00.000Z
---

# Phase 05: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | `c1dca46` — subtract `held` from the tonne limit; 20-tonne regression and hold invariant in the property test |
| WR-01 | warning | fixed | `c1dca46` — `isMarketRowSelectable` is the single predicate for model and session |
| WR-02 | warning | fixed | `c1dca46` — property test asserts `holdPodsUsed <= capacityPodsFor`; repeat-buy boundary case |
| IN-01 | info | fixed | `63e7abf` — comment now states write-mode allow-lists and hold semantics are enforced |
| IN-02 | info | fixed | `63e7abf` — removed `PASSENGER_BERTH_KEY`, `StationShell.setScreen` and `findCommodity` |
| IN-03 | info | deferred | D-15 copy is satisfied and the row description states full trade-in; changing the confirmation re-pins e2e copy — leave for a UX pass |
| IN-04 | info | deferred | test-hardening on an otherwise green inert-key suite; revisit with the e2e flake sweep |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
