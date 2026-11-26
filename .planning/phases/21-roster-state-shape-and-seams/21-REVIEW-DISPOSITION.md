---
phase: 21-roster-state-shape-and-seams
review: 21-REVIEW.md
recorded: 2026-11-26
counts:
  critical: 0
  warning: 8
  info: 6
open: 0
---

# Phase 21: Code Review Disposition

One row per finding in `21-REVIEW.md`. Two fixer agents (Opus) applied the fixes in isolated worktrees, one commit per finding. The orchestrator merged both branches into main.

| ID | Severity | Finding | Disposition | Evidence |
|----|----------|---------|-------------|----------|
| SIM-WR-01 | warning | An `EQ_WEAPON_NONE` override skips the fire gate and its draw | fixed | 42d04e3c. A fore override now resolves like an authored `EQ_WEAPON_NONE`, takes one draw and then refuses. The aft, port and starboard facings stay undrawn, consistent with `npcWeaponsOf` and the CBT-19 aft tripwire. A 50-tick parity test covers it. |
| SIM-WR-02 | warning | The v5 world records are repaired only as a side effect of `hashWorld`; a snapshot may not parse | fixed | 480ff35e. `repairWorldFields` and `snapshotWorld` call the three sanitisers. Out-of-bound values still reset to pristine (21-06 design). No hash moved. The todo `2026-11-26-world-records-join-repair` moved to completed. |
| SIM-WR-03 | warning | Medical pods carry narcotics, where Oolite releases none; there was no FIDELITY row | fixed | c47e07b4. Adds FIDELITY E-198 as an upstream bug fix (`@"Narcotics"` case mismatch). |
| APP-WR-01 | warning | Stale cold-start comments contradict the D-07 prefetch | fixed | 901ed14d. Comments updated; the PROJECT.md row now carries a dated D-07 amendment note. |
| APP-WR-02 | warning | `escortRoles` has no bound | fixed | 2cbae97f. At most 16 entries (`MAX_ESCORTS`), each role at most 64 characters and pattern-checked. |
| TOOLS-WR-01 | warning | The atlas has no gutter, so edges bleed fill or neighbouring regions at mip levels above 0 | fixed | 8e21fef8 and 7d465e6a. A 32-texel mirrored gutter samples like separate CLAMP_TO_EDGE maps up to mip 5, checked by tests. Draw calls stay at 39 / 42. Texture memory rose 17 % (todo `2026-11-26-npc-atlas-texture-memory` updated). |
| TOOLS-WR-02 | warning | Legacy hulls are winding-repaired twice | fixed | 56c3fb60. The repair now works on a cloned mesh; a guard test covers a mixed-sign Krait face. |
| TOOLS-WR-03 | warning | The comms key `[7]` was classified as a runtime variable | fixed | 6daf5316. It is now a `descriptionIndexes` entry that resolves through `labels.json` `systemDescription`. |
| APP-IN-01 | info | The `spawnTestAnarchy` refusal doc was wrong | fixed | f399059c |
| APP-IN-02 | info | The pod-market cache was keyed by id only | fixed | 20b7f77d. The key is now `${id}:${economy}`. |
| APP-IN-03 | info | The `ships-hulls.ts` header was stale | fixed | 99794935 |
| TOOLS-IN-01 | info | The merge ignored `primitive.indices` | fixed | 815b2ed6. It copies the indices with an offset; an out-of-range index throws. |
| TOOLS-IN-02 | info | Unreachable `continue` branches could misalign the cursor | fixed | 42626840. They now throw through `alignedAt`. |
| TOOLS-IN-03 | info | `atlasImagesOf` dropped differing provenance | fixed, with a deviation | e782e00b. Five emissive masks are legitimately pixel-identical across variants, so provenance is merged as a union, and a slot, size or pixel mismatch fails the build. |
