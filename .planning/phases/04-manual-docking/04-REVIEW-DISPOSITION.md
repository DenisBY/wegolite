---
phase: 04
generated: 2026-11-05
source_review: 04-REVIEW.md
source_fix: 04-REVIEW-FIX.md
---

# Phase 04 — Code Review Disposition

| ID | Title | Severity | Disposition | Source |
| --- | --- | --- | --- | --- |
| CR-01 | Autosave writes a fractional clock that `parseSave` rejects | critical | fixed | `e687537` — floor at snapshot boundary, validate before write |
| CR-02 | Size cap runs before future-version detection | critical | fixed | `86b758b` — bounded pre-cap sniff, unreadable is untouchable |
| WR-01 | Writer can emit a v1 blob larger than `MAX_SAVE_CHARS` | warning | fixed | `afdb8e6` — 32,768 cap with worst-case accounting, credits aligned |
| WR-02 | `backupCorrupt` writes an unbounded blob | warning | fixed | `118fac6` — bounded backup with original-length marker |
| WR-03 | Manual-dock autosave test masked by taint skip | warning | fixed | `8df226b` — `probe.save.attempts` before every skip |
| WR-04 | Read error or unknown shape can be cleared by New game | warning | fixed | `6b3f983` — explicit `canOverwrite`/`canClear`, unreadable untouchable |
| IN-01 | Stale computer-dock message after a manual dock | info | open | Not in fix scope; cosmetic panel message |
| IN-02 | `setOrientation` accepts enormous finite components | info | open | Not in fix scope; probe hardening |
| IN-03 | `probe.save.continueVisible` can be stale | info | open | Not in fix scope; probe-only surface |
| IN-04 | Dead and stale surfaces from the phase | info | open | Not in fix scope; cleanup |
| IN-05 | Restore ignores the saved system/station identity | info | open | Not in fix scope; single-system v1 limitation |
| IN-06 | Corridor invariant conflicts with future aperture expansion | info | open | Not in fix scope; future-ship constraint |
